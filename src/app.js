const API_URL = "/api/tasks";


const form =
    document.getElementById("task-form");

const input =
    document.getElementById("task-input");

const taskList =
    document.getElementById("task-list");

const statusMessage =
    document.getElementById("status-message");

const taskCard =
    document.getElementById("task-card");

const userName =
    document.getElementById("user-name");

const loginButton =
    document.getElementById("login-button");

const logoutButton =
    document.getElementById("logout-button");

const authMessage =
    document.getElementById("auth-message");


let currentUser = null;



/*
--------------------------------
CHECK AUTHENTICATION
--------------------------------
*/

async function checkAuthentication() {

    try {

        const response =
            await fetch("/.auth/me");

        const data =
            await response.json();

        currentUser =
            data.clientPrincipal;


        /*
        User is NOT logged in
        */

        if (!currentUser) {

            showLoggedOutState();

            return;
        }


        /*
        User IS logged in
        */

        showLoggedInState();

        await loadTasks();

    }

    catch (error) {

        console.error(
            "Authentication check failed:",
            error
        );

        showLoggedOutState();
    }
}



/*
--------------------------------
LOGGED-IN UI
--------------------------------
*/

function showLoggedInState() {

    userName.textContent =
        currentUser.userDetails ||
        "Microsoft User";

    loginButton.hidden = true;

    logoutButton.hidden = false;

    taskCard.hidden = false;

    authMessage.textContent =
        "You are signed in. These tasks belong only to your account.";
}



/*
--------------------------------
LOGGED-OUT UI
--------------------------------
*/

function showLoggedOutState() {

    userName.textContent =
        "Not signed in";

    loginButton.hidden = false;

    logoutButton.hidden = true;

    taskCard.hidden = true;

    authMessage.textContent =
        "Sign in with Microsoft to manage your private tasks.";
}



/*
--------------------------------
LOAD TASKS
--------------------------------
*/

async function loadTasks() {

    statusMessage.textContent =
        "Loading tasks...";


    try {

        const response =
            await fetch(API_URL);


        if (!response.ok) {

            throw new Error(
                `Request failed: ${response.status}`
            );
        }


        const tasks =
            await response.json();


        renderTasks(tasks);


        if (tasks.length > 0) {

            statusMessage.textContent = "";
        }

    }

    catch (error) {

        console.error(error);

        statusMessage.textContent =
            "Unable to load tasks.";
    }
}



/*
--------------------------------
DISPLAY TASKS
--------------------------------
*/

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

        listItem.className =
            "task";


        const checkbox =
            document.createElement("input");

        checkbox.type =
            "checkbox";

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

                await deleteTask(
                    task.id
                );
            }
        );


        listItem.append(
            checkbox,
            title,
            deleteButton
        );


        taskList.appendChild(
            listItem
        );
    });
}



/*
--------------------------------
CREATE TASK
--------------------------------
*/

form.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const title =
            input.value.trim();


        if (!title) {

            return;
        }


        const response =
            await fetch(
                API_URL,
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({
                        title
                    })

                }
            );


        if (!response.ok) {

            statusMessage.textContent =
                "Unable to create task.";

            return;
        }


        input.value = "";


        await loadTasks();
    }
);



/*
--------------------------------
UPDATE TASK
--------------------------------
*/

async function updateTask(
    id,
    completed
) {

    const response =
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


    if (!response.ok) {

        statusMessage.textContent =
            "Unable to update task.";

        return;
    }


    await loadTasks();
}



/*
--------------------------------
DELETE TASK
--------------------------------
*/

async function deleteTask(id) {

    const response =
        await fetch(
            `${API_URL}/${id}`,
            {

                method: "DELETE"

            }
        );


    if (!response.ok) {

        statusMessage.textContent =
            "Unable to delete task.";

        return;
    }


    await loadTasks();
}



/*
--------------------------------
START APPLICATION
--------------------------------
*/

checkAuthentication();