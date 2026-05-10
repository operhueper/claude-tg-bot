package main

import (
	"io"
	"os/exec"
)

// newCmd creates an exec.Cmd that writes combined stdout+stderr to w.
func newCmd(args []string, w io.Writer) *exec.Cmd {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = "/workspace"
	cmd.Stdout = w
	cmd.Stderr = w
	return cmd
}
