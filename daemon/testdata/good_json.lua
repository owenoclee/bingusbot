tool = {
    name = "json_tool",
    description = "Test JSON functions",
    parameters = [[{"type":"object","properties":{"mode":{"type":"string"},"data":{"type":"string"}}}]],
    claims = {}
}

function execute(args)
    if args.mode == "decode" then
        local t = json.decode(args.data)
        return t.key
    end
    local t = {key = "value", num = 42}
    return json.encode(t)
end
