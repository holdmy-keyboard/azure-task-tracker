const { app } =
    require("@azure/functions");

const { CosmosClient } =
    require("@azure/cosmos");

const crypto =
    require("crypto");

const {
    assertTaskContainerPartitionKey,
    buildUserTasksQuery,
    createOwnedTask,
    getOwnedTaskItem,
    getUserPartitionQueryOptions
} = require("../taskPartition");


let cachedContainer;



/*
--------------------------------
COSMOS DB CONNECTION
--------------------------------
*/

async function getContainer() {

    if (cachedContainer) {

        return cachedContainer;
    }


    const connectionString =
        process.env.COSMOS_CONNECTION_STRING;

    const databaseName =
        process.env.COSMOS_DATABASE_NAME;

    const containerName =
        process.env.COSMOS_CONTAINER_NAME;


    if (
        !connectionString ||
        !databaseName ||
        !containerName
    ) {

        throw new Error(
            "Cosmos DB environment variables are missing."
        );
    }


    const client =
        new CosmosClient(
            connectionString
        );


    const container =
        client
            .database(databaseName)
            .container(containerName);


    const {
        resource:
        containerResource
    } = await container.read();


    assertTaskContainerPartitionKey(
        containerResource
    );


    cachedContainer =
        container;


    return cachedContainer;
}



/*
--------------------------------
READ AUTHENTICATED USER
--------------------------------
*/

function getClientPrincipal(request) {

    const header =
        request.headers.get(
            "x-ms-client-principal"
        );


    if (!header) {

        return null;
    }


    try {

        const decoded =
            Buffer
                .from(
                    header,
                    "base64"
                )
                .toString("utf8");


        return JSON.parse(
            decoded
        );

    }

    catch {

        return null;
    }
}



/*
================================
TASK API
================================
*/

function createTasksHandler(
    resolveContainer = getContainer
) {
    return async (
        request,
        context
    ) => {


                try {

                    /*
                    -------------------------
                    AUTHENTICATE USER
                    -------------------------
                    */

                    const principal =
                        getClientPrincipal(
                            request
                        );


                    if (
                        !principal ||
                        !principal.userId
                    ) {

                        return {

                            status: 401,

                            jsonBody: {

                                error:
                                    "Authentication required."

                            }

                        };
                    }


                    const userID =
                        principal.userId;


                    const container =
                        await resolveContainer();



                    /*
                    -------------------------
                    GET USER'S TASKS
                    -------------------------
                    */

                    if (
                        request.method ===
                        "GET"
                    ) {


                        const query =
                            buildUserTasksQuery(
                                userID
                            );


                        const {
                            resources
                        } =
                            await container
                                .items
                                .query(
                                    query,
                                    getUserPartitionQueryOptions(
                                        userID
                                    )
                                )
                                .fetchAll();


                        return {

                            status: 200,

                            jsonBody:
                                resources

                        };
                    }



                    /*
                    -------------------------
                    CREATE TASK
                    -------------------------
                    */

                    if (
                        request.method ===
                        "POST"
                    ) {


                        const body =
                            await request.json();


                        const title =
                            String(
                                body.title || ""
                            ).trim();


                        if (!title) {

                            return {

                                status: 400,

                                jsonBody: {

                                    error:
                                        "Task title is required."

                                }

                            };
                        }


                        const task =
                            createOwnedTask({

                                id:
                                    crypto.randomUUID(),

                                userID,

                                title,

                                createdAt:
                                    new Date()
                                        .toISOString()

                            });


                        const {
                            resource
                        } =
                            await container
                                .items
                                .create(task);


                        return {

                            status: 201,

                            jsonBody:
                                resource

                        };
                    }



                    /*
                    -------------------------
                    UPDATE TASK
                    -------------------------
                    */

                    if (
                        request.method ===
                        "PATCH"
                    ) {


                        const id =
                            request.params.id;


                        if (!id) {

                            return {

                                status: 400,

                                jsonBody: {

                                    error:
                                        "Task ID is required."

                                }

                            };
                        }


                        /*
                        Important:

                        userID is the partition
                        key.

                        This ensures one user
                        cannot retrieve another
                        user's task.
                        */

                        const {
                            resource:
                            existingTask
                        } =
                            await getOwnedTaskItem(
                                container,
                                id,
                                userID
                            )
                                .read();


                        if (
                            !existingTask
                        ) {

                            return {

                                status: 404,

                                jsonBody: {

                                    error:
                                        "Task not found."

                                }

                            };
                        }


                        const body =
                            await request.json();


                        if (
                            typeof body.completed ===
                            "boolean"
                        ) {

                            existingTask.completed =
                                body.completed;
                        }

                        existingTask.updatedAt =
                            new Date()
                                .toISOString();


                        const {
                            resource
                        } =
                            await getOwnedTaskItem(
                                container,
                                id,
                                userID
                            )
                                .replace(
                                    existingTask
                                );


                        return {

                            status: 200,

                            jsonBody:
                                resource

                        };
                    }



                    /*
                    -------------------------
                    DELETE TASK
                    -------------------------
                    */

                    if (
                        request.method ===
                        "DELETE"
                    ) {


                        const id =
                            request.params.id;


                        if (!id) {

                            return {

                                status: 400,

                                jsonBody: {

                                    error:
                                        "Task ID is required."

                                }

                            };
                        }


                        await getOwnedTaskItem(
                            container,
                            id,
                            userID
                        )
                            .delete();


                        return {

                            status: 204

                        };
                    }



                    return {

                        status: 405

                    };

                }


                catch (error) {


                    context.error(
                        error
                    );


                    if (
                        error.code === 404
                    ) {

                        return {

                            status: 404,

                            jsonBody: {

                                error:
                                    "Task not found."

                            }

                        };
                    }


                    return {

                        status: 500,

                        jsonBody: {

                            error:
                                "An unexpected server error occurred."

                        }

                    };
                }
            };
}


const tasksHandler =
    createTasksHandler();


app.http(
    "tasks",
    {

        methods: [
            "GET",
            "POST",
            "PATCH",
            "DELETE"
        ],

        authLevel:
            "anonymous",

        route:
            "tasks/{id?}",

        handler:
            tasksHandler
    }
);


module.exports = {
    createTasksHandler,
    getClientPrincipal
};
