const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createTasksHandler
} = require("../src/functions/tasks");

function createRequest(method, userId, body = {}) {
    const encodedPrincipal = Buffer
        .from(
            JSON.stringify({
                userId
            })
        )
        .toString("base64");

    return {
        method,
        params: {},
        headers: {
            get(name) {
                return name === "x-ms-client-principal"
                    ? encodedPrincipal
                    : null;
            }
        },
        async json() {
            return body;
        }
    };
}

function createContext() {
    return {
        error(error) {
            throw error;
        }
    };
}

test("maps the SWA userId claim to the Cosmos userID query partition", async () => {
    const calls = [];
    const container = {
        items: {
            query(query, options) {
                calls.push({ query, options });
                return {
                    async fetchAll() {
                        return {
                            resources: []
                        };
                    }
                };
            }
        }
    };
    const handler =
        createTasksHandler(async () => container);

    const response = await handler(
        createRequest("GET", "user-a"),
        createContext()
    );

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(
        calls[0].query.query,
        /WHERE c\.userID = @userID/
    );
    assert.deepEqual(
        calls[0].query.parameters,
        [
            {
                name: "@userID",
                value: "user-a"
            }
        ]
    );
    assert.deepEqual(
        calls[0].options,
        {
            partitionKey: "user-a"
        }
    );
});

test("stores the SWA userId claim only as the Cosmos userID property", async () => {
    let createdTask;
    const container = {
        items: {
            async create(task) {
                createdTask = task;
                return {
                    resource: task
                };
            }
        }
    };
    const handler =
        createTasksHandler(async () => container);

    const response = await handler(
        createRequest(
            "POST",
            "user-a",
            {
                title: "Private task"
            }
        ),
        createContext()
    );

    assert.equal(response.status, 201);
    assert.equal(createdTask.userID, "user-a");
    assert.equal(Object.hasOwn(createdTask, "userId"), false);
});

test("routes PATCH point operations through the authenticated user's partition", async () => {
    const itemCalls = [];
    let replacedTask;
    const existingTask = {
        id: "task-1",
        userID: "user-a",
        title: "Private task",
        completed: false
    };
    const container = {
        item(id, partitionKey) {
            itemCalls.push({ id, partitionKey });
            return {
                async read() {
                    return {
                        resource: existingTask
                    };
                },
                async replace(task) {
                    replacedTask = task;
                    return {
                        resource: task
                    };
                }
            };
        }
    };
    const handler =
        createTasksHandler(async () => container);
    const request = createRequest(
        "PATCH",
        "user-a",
        {
            completed: true
        }
    );
    request.params.id = "task-1";

    const response =
        await handler(request, createContext());

    assert.equal(response.status, 200);
    assert.deepEqual(itemCalls, [
        {
            id: "task-1",
            partitionKey: "user-a"
        },
        {
            id: "task-1",
            partitionKey: "user-a"
        }
    ]);
    assert.equal(replacedTask.completed, true);
});

test("routes DELETE through the authenticated user's partition", async () => {
    const itemCalls = [];
    let deleteCalled = false;
    const container = {
        item(id, partitionKey) {
            itemCalls.push({ id, partitionKey });
            return {
                async delete() {
                    deleteCalled = true;
                }
            };
        }
    };
    const handler =
        createTasksHandler(async () => container);
    const request =
        createRequest("DELETE", "user-b");
    request.params.id = "task-1";

    const response =
        await handler(request, createContext());

    assert.equal(response.status, 204);
    assert.equal(deleteCalled, true);
    assert.deepEqual(itemCalls, [
        {
            id: "task-1",
            partitionKey: "user-b"
        }
    ]);
});
