Via https://gist.github.com/oseme-techguy/bae2e309c084d93b75a9b25f49718f85

```shell
#!/usr/bin/env bash

# To fix the " gpg: WARNING: unsafe permissions on homedir '/home/path/to/user/.gnupg' " error
# Make sure that the .gnupg directory and its contents is accessibile by your user.
chown -R $(whoami) ~/.gnupg/

# Also correct the permissions and access rights on the directory
chmod 600 ~/.gnupg/*
chmod 700 ~/.gnupg
```
