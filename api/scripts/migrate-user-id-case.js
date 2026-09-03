const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const {
    CosmosClient,
    PartitionKeyBuilder
} = require("@azure/cosmos");

const {
    TASK_OWNER_PROPERTY,
    assertTaskContainerPartitionKey
} = require("../src/taskPartition");

const LEGACY_OWNER_PROPERTY = "userId";
const SYSTEM_PROPERTIES = new Set([
    "_attachments",
    "_etag",
    "_rid",
    "_self",
    "_ts"
]);

function readSettings() {
    const settingsPath =
        path.join(__dirname, "..", "local.settings.json");

    let localValues = {};

    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(
            fs.readFileSync(settingsPath, "utf8")
        );

        localValues = settings.Values || {};
    }

    const values = {
        ...localValues,
        ...process.env
    };

    for (const name of [
        "COSMOS_CONNECTION_STRING",
        "COSMOS_DATABASE_NAME",
        "COSMOS_CONTAINER_NAME"
    ]) {
        if (!values[name]) {
            throw new Error(`${name} is required.`);
        }
    }

    return values;
}

function stripSystemProperties(document) {
    return Object.fromEntries(
        Object.entries(document).filter(
            ([name]) => !SYSTEM_PROPERTIES.has(name)
        )
    );
}

function buildMigratedDocument(source) {
    if (
        typeof source.id !== "string" ||
        !source.id ||
        typeof source[LEGACY_OWNER_PROPERTY] !== "string" ||
        !source[LEGACY_OWNER_PROPERTY] ||
        typeof source._etag !== "string" ||
        !source._etag
    ) {
        throw new Error(
            "Every legacy task must have a non-empty id, userId, and _etag."
        );
    }

    const migrated = stripSystemProperties(source);

    migrated[TASK_OWNER_PROPERTY] =
        migrated[LEGACY_OWNER_PROPERTY];

    delete migrated[LEGACY_OWNER_PROPERTY];

    return migrated;
}

async function createOrVerifyDestination(
    container,
    source,
    destination
) {
    try {
        await container.items.create(destination);
        return;
    }
    catch (error) {
        if (error.code !== 409) {
            throw error;
        }
    }

    const { resource: existing } =
        await container
            .item(
                destination.id,
                destination[TASK_OWNER_PROPERTY]
            )
            .read();

    if (
        !existing ||
        !isDeepStrictEqual(
            stripSystemProperties(existing),
            destination
        )
    ) {
        throw new Error(
            `Destination conflict for task ${source.id}; the legacy item was not deleted.`
        );
    }
}

async function verifyDestination(container, destination) {
    const { resource } =
        await container
            .item(
                destination.id,
                destination[TASK_OWNER_PROPERTY]
            )
            .read();

    if (
        !resource ||
        !isDeepStrictEqual(
            stripSystemProperties(resource),
            destination
        )
    ) {
        throw new Error(
            `Verification failed for task ${destination.id}; no legacy items were deleted.`
        );
    }
}

async function main() {
    const applyMigration =
        process.argv.includes("--apply");
    const writesDisabled =
        process.argv.includes("--confirm-writes-disabled");

    if (applyMigration && !writesDisabled) {
        throw new Error(
            "Refusing to migrate while task writes may still be active. Stop all application writes, then add --confirm-writes-disabled."
        );
    }

    const values = readSettings();
    const client =
        new CosmosClient(values.COSMOS_CONNECTION_STRING);
    const container =
        client
            .database(values.COSMOS_DATABASE_NAME)
            .container(values.COSMOS_CONTAINER_NAME);

    const { resource: containerResource } =
        await container.read();

    assertTaskContainerPartitionKey(containerResource);

    const undefinedPartitionKey =
        new PartitionKeyBuilder()
            .addNoneValue()
            .build();

    const { resources: undefinedPartitionItems } =
        await container.items
            .query(
                "SELECT * FROM c",
                {
                    partitionKey: undefinedPartitionKey
                }
            )
            .fetchAll();

    const sources = undefinedPartitionItems.filter(
        (item) =>
            Object.hasOwn(item, LEGACY_OWNER_PROPERTY) &&
            !Object.hasOwn(item, TASK_OWNER_PROPERTY)
    );

    if (sources.length !== undefinedPartitionItems.length) {
        throw new Error(
            "The undefined partition contains items that are not recognized legacy tasks. Nothing was changed."
        );
    }

    const migrations = sources.map((source) => ({
        source,
        destination: buildMigratedDocument(source)
    }));

    console.log(
        `Found ${migrations.length} legacy task(s) to migrate from ${LEGACY_OWNER_PROPERTY} to ${TASK_OWNER_PROPERTY}.`
    );

    if (!applyMigration || migrations.length === 0) {
        console.log(
            applyMigration
                ? "No migration was necessary."
                : "Dry run only. After stopping all task writes, re-run with --apply --confirm-writes-disabled."
        );
        return;
    }

    for (const migration of migrations) {
        await createOrVerifyDestination(
            container,
            migration.source,
            migration.destination
        );
    }

    for (const { destination } of migrations) {
        await verifyDestination(container, destination);
    }

    for (const { source } of migrations) {
        await container
            .item(source.id, undefinedPartitionKey)
            .delete({
                accessCondition: {
                    type: "IfMatch",
                    condition: source._etag
                }
            });
    }

    const { resources: remainingLegacyItems } =
        await container.items
            .query(
                `SELECT VALUE COUNT(1) FROM c WHERE IS_DEFINED(c.${LEGACY_OWNER_PROPERTY}) AND NOT IS_DEFINED(c.${TASK_OWNER_PROPERTY})`,
                {
                    partitionKey: undefinedPartitionKey
                }
            )
            .fetchAll();

    if (remainingLegacyItems[0] !== 0) {
        throw new Error(
            `${remainingLegacyItems[0]} legacy task(s) remain after migration.`
        );
    }

    console.log(
        `Migrated ${migrations.length} task(s) to ${TASK_OWNER_PROPERTY} successfully.`
    );
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    buildMigratedDocument,
    createOrVerifyDestination,
    stripSystemProperties,
    verifyDestination
};
