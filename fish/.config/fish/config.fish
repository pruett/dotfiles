# -------------
# Paths
# -------------
fish_add_path -g\
 /usr/local/bin\
 /usr/local/sbin\
 /usr/bin\
 /bin\
 /usr/sbin\
 /sbin

# -------------
# Rust
# -------------
if test -d ~/.cargo/bin/
    fish_add_path -ga "$HOME/.cargo/bin"
end

# -------------
# asdf
# -------------
if test -d /usr/local/opt/asdf
    source /usr/local/opt/asdf/asdf.fish
end

# -------------
# Additional (optional) config
# -------------
if test -e ~/.localconfig.fish
    source ~/.localconfig.fish
end

# -------------
# Prompt
#
# https://github.com/starship/starship
# -------------
starship init fish | source


# -------------
# Functions
# -------------
function brewu -d "Update and clenaup Homebrew formulae"
    echo "Updating Homebrew..."
    and brew update
    and echo "Upgrading Homebrew formulae..."
    and brew upgrade
    and echo "Cleaning up Homebrew..."
    and brew cleanup
    and brew doctor
end

function dot -d "Open dotfiles in VSCode"
    cd ~/.dotfiles && code .
end

function cleands -d "Clean .DS_Store files from directory"
    find . -name '*.DS_Store' -type f -delete -print
end

function fish_greeting --description "Remove fish greeting"
end
set -U fish_greeting

function reload
    source ~/.config/fish/config.fish
end

function rm -d "Prompt confirmation when removing files"
    command rm -i $argv
end

function vim -d "Overwrite vim to use neovim"
    nvim $argv
end

function list_node_modules -d "Recursively find and list node_modules directories"
    find . -name "node_modules" -type d -prune -print | xargs du -chs
end

function clean_node_modules -d "Recursively find and remove all node_modules directories"
    find . -name 'node_modules' -type d -prune -print -exec rm -rf '{}' \;
end

# -------------
# Editor
# -------------
set -Ux EDITOR nvim

# -------------
# Enable vi-like editing mode
# -------------
set -U fish_key_bindings fish_vi_key_bindings

# -------------
# FZF options
# -------------
set -U FZF_LEGACY_KEYBINDINGS 0
set -gx FZF_DEFAULT_OPTS "--height 50% --reverse --border --preview='head -n15 {}' --preview-window='40%'"

# -------------
# Z config
# -------------
set -U Z_CMD "j"

# -------------
# XDG directories
# -------------
set -Ux XDG_CONFIG_HOME ~/.config
set -Ux XDG_DATA_HOME ~/.local/share

# -------------
# GPG
# -------------
set -x GPG_TTY (tty)
