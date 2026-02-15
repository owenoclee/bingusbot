tool = {
    name = "fs_tool",
    description = "Tool with fs claims",
    parameters = [[{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}]],
    claims = {"fs.read", "fs.list"}
}

function execute(args)
    local content = fs.read(args.path)
    if content then return content end
    return "nil"
end
