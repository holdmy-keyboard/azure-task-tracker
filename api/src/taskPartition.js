const TASK_OWNER_PROPERTY = "userID";
const TASK_PARTITION_KEY_PATH = `/${TASK_OWNER_PROPERTY}`;
const TASK_OWNER_QUERY_PARAMETER = "@userID";

function assertTaskContainerPartitionKey(containerResource) {
    const configuredPaths =
        containerResource?.partitionKey?.paths;

    if (
        !Array.isArray(configuredPaths) ||
        configuredPaths.length !== 1 ||
        configuredPaths[0] !== TASK_PARTITION_KEY_PATH
    ) {
        const actualPath =
            Array.isArray(configuredPaths)
                ? configuredPaths.join(", ")
                : "missing";

        throw new Error(
            `Cosmos DB container partition key must be ${TASK_PARTITION_KEY_PATH}; found ${actualPath}.`
        );
    }
}

function buildUserTasksQuery(userID) {
    return {
        query: `
            SELECT *
            FROM c
            WHERE c.${TASK_OWNER_PROPERTY} = ${TASK_OWNER_QUERY_PARAMETER}
            ORDER BY c.createdAt DESC
        `,
        parameters: [
            {
                name: TASK_OWNER_QUERY_PARAMETER,
                value: userID
            }
        ]
    };
}

function getUserPartitionQueryOptions(userID) {
    return {
        partitionKey: userID
    };
}

function createOwnedTask({
    id,
    userID,
    title,
    createdAt
}) {
    return {
        id,
        [TASK_OWNER_PROPERTY]: userID,
        title,
        completed: false,
        createdAt
    };
}

function getOwnedTaskItem(container, id, userID) {
    return container.item(id, userID);
}

module.exports = {
    TASK_OWNER_PROPERTY,
    TASK_PARTITION_KEY_PATH,
    assertTaskContainerPartitionKey,
    buildUserTasksQuery,
    createOwnedTask,
    getOwnedTaskItem,
    getUserPartitionQueryOptions
};
