tool = {
    name = "time_tool",
    description = "Test time functions",
    parameters = [[{"type":"object","properties":{"mode":{"type":"string"}}}]],
    claims = {}
}

function execute(args)
    if args.mode == "unix" then
        return tostring(time.unix())
    end
    return time.now()
end
