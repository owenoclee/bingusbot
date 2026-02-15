tool = {
    name = "badclaim",
    description = "Invalid claim",
    parameters = [[{"type":"object"}]],
    claims = {"bogus.claim"}
}

function execute(args)
    return "ok"
end
