const test = require("node:test");
const assert = require("node:assert/strict");

const {
    TASK_OWNER_PROPERTY,
    TASK_PARTITION_KEY_PATH,
    assertTaskContainerPartitionKey,
    buildUserTasksQuery,
    createOwnedTask,
    getOwnedTaskItem,
    getUserPartitionQueryOptions
} = require("../src/taskPartition");

test("uses the deployed Cosmos partition-key casing", () => {
    assert.equal(TASK_OWNER_PROPERTY, "userID");
    assert.equal(TASK_PARTITION_KEY_PATH, "/userID");
});

test("builds a user-scoped query with the exact owner property", () => {
    const query = buildUserTasksQuery("user-a");

    assert.match(query.query, /WHERE c\.userID = @userID/);
    assert.doesNotMatch(query.query, /c\.userId/);
    assert.deepEqual(query.parameters, [
        {
            name: "@userID",
            value: "user-a"
        }
    ]);
});

test("creates documents with userID and never userId", () => {
    const task = createOwnedTask({
        id: "task-1",
        userID: "user-a",
        title: "Private task",
        createdAt: "2026-09-03T10:00:00.000Z"
    });

    assert.deepEqual(task, {
        id: "task-1",
        userID: "user-a",
        title: "Private task",
        completed: false,
        createdAt: "2026-09-03T10:00:00.000Z"
    });
    assert.equal(Object.hasOwn(task, "userId"), false);
});

test("uses the authenticated user ID as the point-operation partition key", () => {
    const calls = [];
    const expectedItem = {};
    const container = {
        item(id, partitionKey) {
            calls.push({ id, partitionKey });
            return expectedItem;
        }
    };

    const item =
        getOwnedTaskItem(container, "task-1", "user-a");

    assert.equal(item, expectedItem);
    assert.deepEqual(calls, [
        {
            id: "task-1",
            partitionKey: "user-a"
        }
    ]);
});

test("scopes list queries to the authenticated user's logical partition", () => {
    assert.deepEqual(
        getUserPartitionQueryOptions("user-a"),
        {
            partitionKey: "user-a"
        }
    );
});

test("rejects a container whose partition-key casing drifts", () => {
    assert.doesNotThrow(() => {
        assertTaskContainerPartitionKey({
            partitionKey: {
                paths: ["/userID"]
            }
        });
    });

    assert.throws(
        () => {
            assertTaskContainerPartitionKey({
                partitionKey: {
                    paths: ["/userId"]
                }
            });
        },
        /must be \/userID; found \/userId/
    );
});
