tool = {
    name = "echo",
    description = "Echo a message",
    parameters = [[{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}]],
    claims = {}
}

function execute(args)
    return args.message
end
