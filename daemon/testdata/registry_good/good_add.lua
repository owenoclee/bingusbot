tool = {
    name = "add",
    description = "Add two numbers",
    parameters = [[{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}]],
    claims = {}
}

function execute(args)
    return tostring(args.a + args.b)
end
