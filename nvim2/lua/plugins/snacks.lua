return {
    {
        "folke/snacks.nvim",
        opts = {
            picker = {
                sources = {
                    explorer = {
                        hidden = true,   -- for hidden files
                        ignored = false, -- for .gitignore files
                    },
                    files = {
                        hidden = true,   -- for hidden files
                        ignored = false, -- for .gitignore files
                    }
                }
            },
        },
    },
}
