tool = {
    name = "nested",
    description = "Test nested argument passing",
    parameters = [[{"type":"object","properties":{"user":{"type":"object"},"tags":{"type":"array"}}}]],
    claims = {}
}

function execute(args)
    return args.user.name .. ":" .. tostring(args.user.age) .. ":" .. tostring(#args.tags)
end
