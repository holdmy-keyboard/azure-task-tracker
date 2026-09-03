const { app } = require("@azure/functions");
const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");

let cachedContainer;

function getContainer() {

    if (cachedContainer) {
        return cachedContainer;
    }

    const connectionString =
        process.env.COSMOS_CONNECTION_STRING;

    const databaseName =
        process.env.COSMOS_DATABASE_NAME;

    const containerName =
        process.env.COSMOS_CONTAINER_NAME;

    if (!connectionString ||
        !databaseName ||
        !containerName) {

        throw new Error(
            "Cosmos DB environment variables are missing."
        );
    }

    const client =
        new CosmosClient(connectionString);

    cachedContainer =
        client
            .database(databaseName)
            .container(containerName);

    return cachedContainer;
}


app.http("tasks", {

    methods: [
        "GET",
        "POST",
        "PATCH",
        "DELETE"
    ],

    authLevel: "anonymous",

    route: "tasks/{id?}",


    handler: async (request, context) => {

        try {

            const container = getContainer();

            /*
            -------------------------
            GET ALL TASKS
            -------------------------
            */

            if (request.method === "GET") {

                const query = {
                    query: `
                        SELECT *
                        FROM c
                        ORDER BY c.createdAt DESC
                    `
                };

                const { resources } =
                    await container.items
                        .query(query)
                        .fetchAll();

                return {
                    status: 200,
                    jsonBody: resources
                };
            }


            /*
            -------------------------
            CREATE TASK
            -------------------------
            */

            if (request.method === "POST") {

                const body =
                    await request.json();

                const title =
                    String(body.title || "").trim();

                if (!title) {

                    return {
                        status: 400,
                        jsonBody: {
                            error: "Task title is required."
                        }
                    };
                }

                const task = {

                    id: crypto.randomUUID(),

                    title: title,

                    completed: false,

                    createdAt:
                        new Date().toISOString()
                };

                const { resource } =
                    await container.items.create(task);

                return {
                    status: 201,
                    jsonBody: resource
                };
            }


            /*
            -------------------------
            UPDATE TASK
            -------------------------
            */

            if (request.method === "PATCH") {

                const id =
                    request.params.id;

                if (!id) {

                    return {
                        status: 400,
                        jsonBody: {
                            error: "Task ID is required."
                        }
                    };
                }

                const body =
                    await request.json();

                const { resource: existingTask } =
                    await container
                        .item(id, id)
                        .read();

                if (!existingTask) {

                    return {
                        status: 404,
                        jsonBody: {
                            error: "Task not found."
                        }
                    };
                }

                if (
                    typeof body.completed ===
                    "boolean"
                ) {

                    existingTask.completed =
                        body.completed;
                }

                existingTask.updatedAt =
                    new Date().toISOString();

                const { resource } =
                    await container
                        .item(id, id)
                        .replace(existingTask);

                return {
                    status: 200,
                    jsonBody: resource
                };
            }


            /*
            -------------------------
            DELETE TASK
            -------------------------
            */

            if (request.method === "DELETE") {

                const id =
                    request.params.id;

                if (!id) {

                    return {
                        status: 400,
                        jsonBody: {
                            error: "Task ID is required."
                        }
                    };
                }

                await container
                    .item(id, id)
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

            context.error(error);

            if (error.code === 404) {

                return {
                    status: 404,
                    jsonBody: {
                        error: "Task not found."
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
    }
});