const API_URL = "/api/tasks";

const form =
    document.getElementById("task-form");

const input =
    document.getElementById("task-input");

const taskList =
    document.getElementById("task-list");

const statusMessage =
    document.getElementById("status-message");


async function loadTasks() {

    statusMessage.textContent =
        "Loading tasks...";

    try {

        const response =
            await fetch(API_URL);

        const tasks =
            await response.json();

        renderTasks(tasks);

        statusMessage.textContent = "";

    }

    catch (error) {

        console.error(error);

        statusMessage.textContent =
            "Unable to load tasks.";
    }
}


function renderTasks(tasks) {

    taskList.innerHTML = "";

    if (tasks.length === 0) {

        statusMessage.textContent =
            "No tasks yet.";

        return;
    }

    tasks.forEach(task => {

        const listItem =
            document.createElement("li");

        listItem.className = "task";


        const checkbox =
            document.createElement("input");

        checkbox.type = "checkbox";

        checkbox.checked =
            task.completed;


        const title =
            document.createElement("span");

        title.textContent =
            task.title;

        title.className =
            task.completed
                ? "task-title completed"
                : "task-title";


        const deleteButton =
            document.createElement("button");

        deleteButton.textContent =
            "Delete";

        deleteButton.className =
            "delete-button";


        checkbox.addEventListener(
            "change",
            async () => {

                await updateTask(
                    task.id,
                    checkbox.checked
                );
            }
        );


        deleteButton.addEventListener(
            "click",
            async () => {

                await deleteTask(task.id);
            }
        );


        listItem.append(
            checkbox,
            title,
            deleteButton
        );

        taskList.appendChild(listItem);
    });
}


form.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        const title =
            input.value.trim();

        if (!title) {
            return;
        }

        await fetch(API_URL, {

            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                title
            })
        });

        input.value = "";

        await loadTasks();
    }
);


async function updateTask(
    id,
    completed
) {

    await fetch(
        `${API_URL}/${id}`,
        {

            method: "PATCH",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                completed
            })
        }
    );

    await loadTasks();
}


async function deleteTask(id) {

    await fetch(
        `${API_URL}/${id}`,
        {
            method: "DELETE"
        }
    );

    await loadTasks();
}


loadTasks();