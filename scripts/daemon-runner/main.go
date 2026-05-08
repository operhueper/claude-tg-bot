package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	maxDaemons     = 3
	manifestPath   = "/opt/vault/%s/.daemons.yaml"
	logsDir        = "/opt/vault/%s/logs"
	eventsDir      = "/opt/vault/%s/.daemons-events"
	watchInterval  = 5 * time.Second
	maxLogSize     = 10 * 1024 * 1024 // 10 MB
	gracePeriod    = 10 * time.Second
	crashWindow    = 10 * time.Minute
	crashThreshold = 3
)

// backoffSteps in seconds
var backoffSteps = []time.Duration{1, 2, 5, 15, 30, 30}

type DaemonSpec struct {
	Name    string            `yaml:"name"`
	Cmd     []string          `yaml:"cmd"`
	Workdir string            `yaml:"workdir"`
	Env     map[string]string `yaml:"env"`
	Enabled bool              `yaml:"enabled"`
}

type Manifest struct {
	Daemons []DaemonSpec `yaml:"daemons"`
}

type crashEvent struct {
	at  time.Time
	err string
}

type daemon struct {
	spec     DaemonSpec
	mu       sync.Mutex
	cmd      *exec.Cmd
	stopped  bool   // permanently stopped due to crashloop
	backoff  int    // index into backoffSteps
	crashes  []crashEvent
	logFile  *os.File
	cancelCh chan struct{} // closed to request stop
	doneCh   chan struct{} // closed when loop exits
}

type runner struct {
	vaultDir  string
	mu        sync.Mutex
	daemons   map[string]*daemon
	shutdown  chan struct{}
}

func newRunner(vaultDir string) *runner {
	return &runner{
		vaultDir: vaultDir,
		daemons:  make(map[string]*daemon),
		shutdown: make(chan struct{}),
	}
}

func (r *runner) manifestPath() string {
	return filepath.Join(r.vaultDir, ".daemons.yaml")
}

func (r *runner) logsDir() string {
	return filepath.Join(r.vaultDir, "logs")
}

func (r *runner) eventsDir() string {
	return filepath.Join(r.vaultDir, ".daemons-events")
}

func readManifest(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func openLog(logsDir, name string) (*os.File, error) {
	if err := os.MkdirAll(logsDir, 0o755); err != nil {
		return nil, err
	}
	path := filepath.Join(logsDir, name+".log")
	return os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
}

// rotateLog rotates if current log exceeds maxLogSize. Returns the (possibly new) file.
func rotateLog(f *os.File, logsDir, name string) *os.File {
	info, err := f.Stat()
	if err != nil || info.Size() < maxLogSize {
		return f
	}
	f.Close()
	rotated := filepath.Join(logsDir, name+".log.1")
	os.Rename(filepath.Join(logsDir, name+".log"), rotated)
	newF, err := openLog(logsDir, name)
	if err != nil {
		log.Printf("[daemon-runner] failed to open rotated log for %s: %v", name, err)
		return f
	}
	return newF
}

// writeCrashevent creates the events dir file that TS bot will read.
func (r *runner) writeCrashEvent(name, lastErr string) {
	evDir := r.eventsDir()
	os.MkdirAll(evDir, 0o755)
	payload := map[string]string{
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
		"daemon":       name,
		"last_excerpt": lastErr,
	}
	data, _ := json.MarshalIndent(payload, "", "  ")
	path := filepath.Join(evDir, name+"-crashloop.json")
	os.WriteFile(path, data, 0o644)
}

// writeLog writes a timestamped line to the daemon's log file.
func writeLog(f io.Writer, format string, args ...any) {
	fmt.Fprintf(f, "[%s] %s\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(format, args...))
}

func (d *daemon) run(r *runner) {
	defer close(d.doneCh)
	logsD := r.logsDir()

	f, err := openLog(logsD, d.spec.Name)
	if err != nil {
		log.Printf("[daemon-runner] cannot open log for %s: %v", d.spec.Name, err)
		return
	}
	d.mu.Lock()
	d.logFile = f
	d.mu.Unlock()
	defer func() {
		d.mu.Lock()
		d.logFile.Close()
		d.mu.Unlock()
	}()

	for {
		select {
		case <-d.cancelCh:
			return
		default:
		}

		d.mu.Lock()
		if d.stopped {
			d.mu.Unlock()
			return
		}
		lf := d.logFile
		d.mu.Unlock()

		lf = rotateLog(lf, logsD, d.spec.Name)
		d.mu.Lock()
		d.logFile = lf
		d.mu.Unlock()

		writeLog(lf, "[START] %v", d.spec.Cmd)

		cmd := exec.Command(d.spec.Cmd[0], d.spec.Cmd[1:]...)
		cmd.Stdout = lf
		cmd.Stderr = lf
		if d.spec.Workdir != "" {
			cmd.Dir = d.spec.Workdir
		} else {
			cmd.Dir = r.vaultDir
		}
		// inherit parent env, then overlay spec env
		cmd.Env = os.Environ()
		for k, v := range d.spec.Env {
			cmd.Env = append(cmd.Env, k+"="+v)
		}

		d.mu.Lock()
		d.cmd = cmd
		d.mu.Unlock()

		startErr := cmd.Start()
		if startErr != nil {
			writeLog(lf, "[ERROR] start failed: %v", startErr)
		} else {
			cmd.Wait()
		}

		d.mu.Lock()
		d.cmd = nil
		d.mu.Unlock()

		exitMsg := "exited"
		if startErr != nil {
			exitMsg = fmt.Sprintf("start error: %v", startErr)
		} else if cmd.ProcessState != nil {
			exitMsg = fmt.Sprintf("exit %d", cmd.ProcessState.ExitCode())
		}
		writeLog(lf, "[EXIT] %s", exitMsg)

		// Check if stop was requested while process was running.
		select {
		case <-d.cancelCh:
			return
		default:
		}

		// Record crash and check window.
		now := time.Now()
		d.mu.Lock()
		d.crashes = append(d.crashes, crashEvent{at: now, err: exitMsg})
		// Prune old events outside window.
		cutoff := now.Add(-crashWindow)
		filtered := d.crashes[:0]
		for _, c := range d.crashes {
			if c.at.After(cutoff) {
				filtered = append(filtered, c)
			}
		}
		d.crashes = filtered
		crashCount := len(d.crashes)
		lastErr := exitMsg
		d.mu.Unlock()

		if crashCount >= crashThreshold {
			d.mu.Lock()
			d.stopped = true
			d.mu.Unlock()
			writeLog(lf, "[STOPPED] crashloop detected (%d crashes in %s)", crashCount, crashWindow)
			r.writeCrashEvent(d.spec.Name, lastErr)
			return
		}

		// Backoff before restart.
		d.mu.Lock()
		idx := d.backoff
		if d.backoff < len(backoffSteps)-1 {
			d.backoff++
		}
		delay := backoffSteps[idx] * time.Second
		d.mu.Unlock()

		writeLog(lf, "[RESTART] waiting %s", delay)
		select {
		case <-d.cancelCh:
			return
		case <-time.After(delay):
		}
	}
}

// stop sends SIGTERM, waits gracePeriod, then SIGKILL.
func (d *daemon) stop() {
	close(d.cancelCh)
	d.mu.Lock()
	cmd := d.cmd
	d.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		cmd.Process.Signal(syscall.SIGTERM)
	}
	select {
	case <-d.doneCh:
	case <-time.After(gracePeriod):
		d.mu.Lock()
		cmd2 := d.cmd
		d.mu.Unlock()
		if cmd2 != nil && cmd2.Process != nil {
			cmd2.Process.Kill()
		}
		<-d.doneCh
	}
}

func (r *runner) sync(specs []DaemonSpec) {
	r.mu.Lock()
	defer r.mu.Unlock()

	desired := make(map[string]DaemonSpec)
	count := 0
	for _, s := range specs {
		if !s.Enabled {
			continue
		}
		if count >= maxDaemons {
			log.Printf("[daemon-runner] limit %d reached, ignoring daemon %s", maxDaemons, s.Name)
			continue
		}
		desired[s.Name] = s
		count++
	}

	// Stop removed daemons.
	for name, d := range r.daemons {
		if _, ok := desired[name]; !ok {
			log.Printf("[daemon-runner] stopping removed daemon: %s", name)
			d.stop()
			delete(r.daemons, name)
		}
	}

	// Start new daemons.
	for name, spec := range desired {
		if _, ok := r.daemons[name]; !ok {
			log.Printf("[daemon-runner] starting daemon: %s", name)
			d := &daemon{
				spec:     spec,
				cancelCh: make(chan struct{}),
				doneCh:   make(chan struct{}),
			}
			r.daemons[name] = d
			go d.run(r)
		}
	}
}

func (r *runner) stopAll() {
	r.mu.Lock()
	names := make([]string, 0, len(r.daemons))
	for n := range r.daemons {
		names = append(names, n)
	}
	r.mu.Unlock()

	var wg sync.WaitGroup
	for _, name := range names {
		r.mu.Lock()
		d, ok := r.daemons[name]
		r.mu.Unlock()
		if !ok {
			continue
		}
		wg.Add(1)
		go func(d *daemon) {
			defer wg.Done()
			d.stop()
		}(d)
	}
	wg.Wait()
}

func main() {
	vaultDir := os.Getenv("VAULT_DIR")
	if vaultDir == "" {
		// Derive from running user UID, matching /opt/vault/${userId}/ convention.
		// In the container the only user is the guest, and the container name encodes
		// the userId set by the TS bot in the VAULT_DIR env var. Fall back to /workspace.
		vaultDir = "/workspace"
	}

	log.SetPrefix("[daemon-runner] ")
	log.SetFlags(log.LstdFlags)
	log.Printf("starting, vault=%s", vaultDir)

	r := newRunner(vaultDir)

	// Reap zombies — PID 1 responsibility.
	// We use cmd.Wait() per process, so direct children are reaped there.
	// For any grandchildren that get re-parented to us, we need SIGCHLD handling.
	sigChild := make(chan os.Signal, 32)
	signal.Notify(sigChild, syscall.SIGCHLD)
	go func() {
		for range sigChild {
			for {
				// Non-blocking waitpid(-1) to drain all zombies.
				var ws syscall.WaitStatus
				pid, err := syscall.Wait4(-1, &ws, syscall.WNOHANG, nil)
				if err != nil || pid <= 0 {
					break
				}
			}
		}
	}()

	sigTerm := make(chan os.Signal, 1)
	signal.Notify(sigTerm, syscall.SIGTERM, syscall.SIGINT)

	// Initial load.
	if m, err := readManifest(r.manifestPath()); err == nil {
		r.sync(m.Daemons)
	} else if !os.IsNotExist(err) {
		log.Printf("manifest parse error: %v", err)
	}

	ticker := time.NewTicker(watchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-sigTerm:
			log.Println("shutdown signal received")
			r.stopAll()
			log.Println("all daemons stopped, exiting")
			os.Exit(0)

		case <-ticker.C:
			m, err := readManifest(r.manifestPath())
			if err != nil {
				if !os.IsNotExist(err) {
					log.Printf("manifest read error: %v", err)
				}
				// If file disappeared, stop everything.
				r.sync(nil)
				continue
			}
			r.sync(m.Daemons)
		}
	}
}
