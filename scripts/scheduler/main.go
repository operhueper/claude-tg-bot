package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	defaultScheduleFile    = "/workspace/.schedule.yaml"
	defaultTasksDir        = "/workspace/.tasks"
	defaultNotifyBridgeURL = "http://172.18.0.1:3849/notify"
	checkInterval          = 60 * time.Second
	taskPollInterval       = 30 * time.Second
	maxOutputBytes         = 2000
	defaultCmdTimeout      = 5 * 60 * time.Second
)

// ─── Schedule YAML ────────────────────────────────────────────────────────────

type Schedule struct {
	Name    string   `yaml:"name"`
	Cron    string   `yaml:"cron"`
	Cmd     []string `yaml:"cmd"`
	Notify  bool     `yaml:"notify"`
	Timeout int      `yaml:"timeout"` // seconds; 0 → defaultCmdTimeout
}

type ScheduleConfig struct {
	Schedules []Schedule `yaml:"schedules"`
}

func readScheduleConfig(path string) (*ScheduleConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg ScheduleConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// ─── Cron parser ──────────────────────────────────────────────────────────────

// matchField returns true if value ∈ the cron field expression.
// Supports: *, */step, a-b, comma-separated list, plain number.
func matchField(field string, value int) bool {
	if field == "*" {
		return true
	}
	for _, part := range strings.Split(field, ",") {
		if strings.HasPrefix(part, "*/") {
			step, err := strconv.Atoi(part[2:])
			if err == nil && step > 0 && value%step == 0 {
				return true
			}
			continue
		}
		if idx := strings.Index(part, "-"); idx != -1 {
			a, e1 := strconv.Atoi(part[:idx])
			b, e2 := strconv.Atoi(part[idx+1:])
			if e1 == nil && e2 == nil && value >= a && value <= b {
				return true
			}
			continue
		}
		n, err := strconv.Atoi(part)
		if err == nil && n == value {
			return true
		}
	}
	return false
}

// matchCron returns true if t matches the 5-field cron expression.
// Fields: minute hour day month weekday (0=Sun).
func matchCron(expr string, t time.Time) bool {
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return false
	}
	return matchField(fields[0], t.Minute()) &&
		matchField(fields[1], t.Hour()) &&
		matchField(fields[2], t.Day()) &&
		matchField(fields[3], int(t.Month())) &&
		matchField(fields[4], int(t.Weekday()))
}

// ─── Notify bridge ────────────────────────────────────────────────────────────

type notifyPayload struct {
	UserID  int    `json:"userId"`
	Message string `json:"message"`
}

func sendNotify(bridgeURL string, userID int, msg string) {
	if userID <= 0 {
		return
	}
	payload, _ := json.Marshal(notifyPayload{UserID: userID, Message: msg})
	resp, err := http.Post(bridgeURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		log.Printf("[scheduler] notify error: %v", err)
		return
	}
	resp.Body.Close()
}

// ─── Command runner ───────────────────────────────────────────────────────────

func runCommand(name string, cmd []string, timeout time.Duration, logWriter io.Writer) (string, error) {
	if len(cmd) == 0 {
		return "", fmt.Errorf("empty cmd")
	}

	c := make(chan error, 1)
	var out bytes.Buffer
	mw := io.MultiWriter(logWriter, &out)

	proc := newCmd(cmd, mw)
	if err := proc.Start(); err != nil {
		return "", fmt.Errorf("start: %w", err)
	}
	go func() { c <- proc.Wait() }()

	select {
	case err := <-c:
		output := truncate(out.String(), maxOutputBytes)
		return output, err
	case <-time.After(timeout):
		proc.Process.Kill()
		return "", fmt.Errorf("timeout after %s", timeout)
	}
}

// ─── Schedule execution ───────────────────────────────────────────────────────

func runSchedule(s Schedule, userID int, bridgeURL string) {
	timeout := defaultCmdTimeout
	if s.Timeout > 0 {
		timeout = time.Duration(s.Timeout) * time.Second
	}

	logDir := "/workspace/.schedule-runs"
	os.MkdirAll(logDir, 0o755)
	ts := time.Now().Format("2006-01-02T15-04-05")
	logPath := filepath.Join(logDir, s.Name+"-"+ts+".log")
	logFile, err := os.Create(logPath)
	if err != nil {
		log.Printf("[scheduler] cannot create log %s: %v", logPath, err)
		return
	}
	defer logFile.Close()
	fmt.Fprintf(logFile, "[%s] START %v\n", time.Now().Format(time.RFC3339), s.Cmd)

	output, err := runCommand(s.Name, s.Cmd, timeout, logFile)
	if !s.Notify || userID <= 0 {
		return
	}

	var msg string
	if err != nil {
		msg = fmt.Sprintf("❌ %s: %v", s.Name, err)
		if output != "" {
			msg += "\n" + output
		}
	} else if output != "" {
		msg = fmt.Sprintf("✅ %s:\n%s", s.Name, output)
	} else {
		msg = fmt.Sprintf("✅ %s завершился успешно", s.Name)
	}
	sendNotify(bridgeURL, userID, msg)
}

// ─── Background task watcher (Stage 5) ───────────────────────────────────────

// A task is submitted by the model as two files:
//   /workspace/.tasks/<id>.run  — command line (one command per line, first non-empty used)
//   /workspace/.tasks/<id>.status — written by the task itself: "done" | "error:<msg>"
// The watcher picks up new .status files, reads the companion .log, sends notification.

func watchTasks(tasksDir string, userID int, bridgeURL string) {
	seen := map[string]bool{}

	for {
		time.Sleep(taskPollInterval)

		entries, err := os.ReadDir(tasksDir)
		if err != nil {
			continue
		}

		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".status") {
				continue
			}
			key := e.Name()
			if seen[key] {
				continue
			}

			statusPath := filepath.Join(tasksDir, key)
			statusBytes, err := os.ReadFile(statusPath)
			if err != nil {
				continue
			}
			status := strings.TrimSpace(string(statusBytes))
			if status == "running" {
				continue // not done yet
			}

			seen[key] = true

			taskID := strings.TrimSuffix(key, ".status")
			logPath := filepath.Join(tasksDir, taskID+".log")
			logBytes, _ := os.ReadFile(logPath)
			output := truncate(string(logBytes), maxOutputBytes)

			var msg string
			if strings.HasPrefix(status, "done") {
				if output != "" {
					msg = fmt.Sprintf("✅ Задача %s готова:\n%s", taskID, output)
				} else {
					msg = fmt.Sprintf("✅ Задача %s готова", taskID)
				}
			} else {
				msg = fmt.Sprintf("❌ Задача %s завершилась с ошибкой:\n%s", taskID, output)
			}

			if userID > 0 {
				sendNotify(bridgeURL, userID, msg)
			}

			// Clean up status file so it won't fire again on restart
			os.Remove(statusPath)
		}
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func truncate(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(s[:maxBytes]) + "\n…(обрезано)"
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	scheduleFile := env("SCHEDULE_FILE", defaultScheduleFile)
	tasksDir := env("TASKS_DIR", defaultTasksDir)
	bridgeURL := env("NOTIFY_BRIDGE_URL", defaultNotifyBridgeURL)
	userID, _ := strconv.Atoi(os.Getenv("NOTIFY_USER_ID"))

	log.Printf("[scheduler] starting: schedule=%s tasks=%s bridge=%s userId=%d",
		scheduleFile, tasksDir, bridgeURL, userID)

	os.MkdirAll(tasksDir, 0o755)

	// Background task watcher (Stage 5)
	go watchTasks(tasksDir, userID, bridgeURL)

	// Align to next full minute
	now := time.Now()
	next := now.Truncate(time.Minute).Add(time.Minute)
	log.Printf("[scheduler] first tick in %s", time.Until(next).Truncate(time.Second))
	time.Sleep(time.Until(next))

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	for {
		t := time.Now()

		cfg, err := readScheduleConfig(scheduleFile)
		if err != nil {
			if !os.IsNotExist(err) {
				log.Printf("[scheduler] cannot read %s: %v", scheduleFile, err)
			}
			<-ticker.C
			continue
		}

		for _, s := range cfg.Schedules {
			if matchCron(s.Cron, t) {
				log.Printf("[scheduler] triggering %s (%s)", s.Name, s.Cron)
				go runSchedule(s, userID, bridgeURL)
			}
		}

		<-ticker.C
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
