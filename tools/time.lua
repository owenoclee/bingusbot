tool = {
    name = "current_time",
    description = "Get the current date and time",
    parameters = [[{"type":"object","properties":{}}]],
    claims = {}
}

function execute(args)
    return time.now()
end
