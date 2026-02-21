-- Tool that calls a builtin which returns (nil, error)
tool = {
    name = "builtin_error",
    description = "Test builtin error propagation",
    parameters = [[{"type":"object","properties":{}}]]
}

function execute(args)
    return failme()
end
