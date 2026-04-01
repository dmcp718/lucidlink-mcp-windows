package main

import (
	"os/exec"
	"syscall"

	"github.com/jchv/go-webview2"
)

// openWebView2Window opens a native WebView2 window pointing to the given URL.
// Falls back to opening in the default browser if WebView2 is not available.
func openWebView2Window(title, url string, width, height int) {
	go func() {
		w := webview2.NewWithOptions(webview2.WebViewOptions{
			Debug:     false,
			AutoFocus: true,
			WindowOptions: webview2.WindowOptions{
				Title:  title,
				Width:  uint(width),
				Height: uint(height),
				Center: true,
			},
		})
		if w == nil {
			// WebView2 runtime not available — fall back to default browser.
			openInBrowser(url)
			return
		}
		defer w.Destroy()

		w.Navigate(url)
		w.Run()
	}()
}

// openInBrowser opens a URL in the default browser.
func openInBrowser(url string) {
	cmd := exec.Command("cmd", "/c", "start", "", url)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	cmd.Run()
}
