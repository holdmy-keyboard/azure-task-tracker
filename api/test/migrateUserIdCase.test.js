const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildMigratedDocument,
    createOrVerifyDestination,
    stripSystemProperties,
    verifyDestination
} = require("../scripts/migrate-user-id-case");

const source = {
    id: "task-1",
    userId: "user-a",
    title: "Private task",
    completed: false,
    _etag: "source-etag",
    _rid: "source-rid",
    _ts: 123
};

const destination = {
    id: "task-1",
    userID: "user-a",
    title: "Private task",
    completed: false
};

test("builds a clean destination in the userID partition", () => {
    assert.deepEqual(
        buildMigratedDocument(source),
        destination
    );
});

test("accepts an identical destination when a rerun receives 409", async () => {
    const container = {
        items: {
            async create() {
                const error = new Error("Conflict");
                error.code = 409;
                throw error;
            }
        },
        item(id, partitionKey) {
            assert.equal(id, "task-1");
            assert.equal(partitionKey, "user-a");
            return {
                async read() {
                    return {
                        resource: {
                            ...destination,
                            _etag: "destination-etag"
                        }
                    };
                }
            };
        }
    };

    await assert.doesNotReject(
        createOrVerifyDestination(
            container,
            source,
            destination
        )
    );
});

test("refuses to overwrite a conflicting destination", async () => {
    const container = {
        items: {
            async create() {
                const error = new Error("Conflict");
                error.code = 409;
                throw error;
            }
        },
        item() {
            return {
                async read() {
                    return {
                        resource: {
                            ...destination,
                            title: "Different task"
                        }
                    };
                }
            };
        }
    };

    await assert.rejects(
        createOrVerifyDestination(
            container,
            source,
            destination
        ),
        /Destination conflict/
    );
});

test("verifies application data while ignoring Cosmos system properties", async () => {
    const resource = {
        ...destination,
        _etag: "destination-etag",
        _rid: "destination-rid"
    };
    const container = {
        item(id, partitionKey) {
            assert.equal(id, "task-1");
            assert.equal(partitionKey, "user-a");
            return {
                async read() {
                    return {
                        resource
                    };
                }
            };
        }
    };

    assert.deepEqual(
        stripSystemProperties(resource),
        destination
    );
    await assert.doesNotReject(
        verifyDestination(container, destination)
    );
});
