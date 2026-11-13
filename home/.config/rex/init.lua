-- Migrated from Herdr (~/.config/herdr/config.toml) and Ghostty (~/.config/ghostty/config).

-- Herdr: prefix ctrl+a
rex.bind("ctrl+a>ctrl+a", "pane.send_key", { key = "ctrl+a" })
rex.bind("ctrl+a>f", "session.switch")
rex.bind("ctrl+a>\\", "pane.split", { direction = "right" })
rex.bind("ctrl+h", "pane.focus", { direction = "left" })
rex.bind("ctrl+j", "pane.focus", { direction = "down" })
rex.bind("ctrl+k", "pane.focus", { direction = "up" })
rex.bind("ctrl+l", "pane.focus", { direction = "right" })
rex.bind("ctrl+shift+h", "pane.resize", { direction = "left" })
rex.bind("ctrl+shift+j", "pane.resize", { direction = "down" })
rex.bind("ctrl+shift+k", "pane.resize", { direction = "up" })
rex.bind("ctrl+shift+l", "pane.resize", { direction = "right" })
