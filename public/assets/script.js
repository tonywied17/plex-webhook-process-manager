/*
 * File: c:\Users\tonyw\Desktop\media scripts\plex-webhook\public\assets\script.js
 * Project: c:\Users\tonyw\Desktop\media scripts\plex-webhook
 * Created Date: Wednesday October 23rd 2024
 * Author: Tony Wiedman
 * -----
 * Last Modified: Thu October 24th 2024 12:37:30 
 * Modified By: Tony Wiedman
 * -----
 * Copyright (c) 2024 MolexWorks / Tone Web Design
 */



//@ Queue and Logs ---

let lastProcessStatus = '';

//! Send an event to the server
function sendEvent()
{
    const eventType = document.getElementById('eventType').value;
    const formData = new FormData();
    formData.append('payload', JSON.stringify({ event: eventType }));

    fetch('/webhook', {
        method: 'POST',
        body: formData
    }).then(response => response.text())
        .then(data =>
        {
            alert(`${data}`);
            fetchQueue();
            fetchLogs();
        }).catch(error =>
        {
            alert(`Error: ${error.message}`);
        });
}

//! Fetch the queue from the server
function fetchQueue()
{
    fetch('/queue')
        .then(response => response.json())
        .then(data =>
        {
            const queueDiv = document.getElementById('queue');
            queueDiv.innerHTML = '';

            if (data.queue.length === 0)
            {
                const emptyQueue = document.createElement('div');
                emptyQueue.className = 'empty-queue';
                emptyQueue.textContent = 'No items in queue';
                queueDiv.appendChild(emptyQueue);
                return;
            }

            data.queue.forEach((item) =>
            {
                const card = document.createElement('div');
                card.className = 'queue-card';
                card.innerHTML = `
                <h4>${item.processType} Process</h4>
                <p><strong>Script Path:</strong> ${item.scriptPath}</p>
                <p><strong>Params:</strong> ${item.params.join(' ')}</p>
                <button onclick="openProcessModal()">View Status</button>
            `;
                queueDiv.appendChild(card);
            });
        });
}

//! Fetch the logs from the server
function fetchLogs()
{
    fetch('/logs')
        .then(response => response.json())
        .then(data =>
        {
            const logDiv = document.getElementById('log');
            logDiv.innerHTML = '';

            data.logs.forEach((log, index) =>
            {
                const logEntry = document.createElement('div');

                // Apply the class based on the logType (INFO, SUCCESS, WARN, ERROR, etc.)
                logEntry.className = `log-entry log-${log.logType.trim()}`;

                logEntry.innerHTML = `
                    <div>${log.message}</div>
                    ${log.payload ? `<button onclick="viewPayload(${index})">View Payload</button>` : ''}
                `;
                logDiv.appendChild(logEntry);
            });

            logDiv.scrollTop = logDiv.scrollHeight;
        });
}



//@ Payload Modal ---

//! View the payload in a modal
//! \param index The index of the log in the logs array
function viewPayload(index)
{
    fetch('/logs')
        .then(response => response.json())
        .then(data =>
        {
            const payloadModal = document.getElementById('payload-modal');
            const payloadContentTree = document.getElementById('payload-content-tree');
            const payload = data.logs[index].payload;

            payloadContentTree.innerHTML = '';

            if (payload)
            {
                payloadContentTree.appendChild(renderJsonTree(payload));
            }

            payloadModal.classList.add('active');
        });
}

//! Recursively render a key-value tree for JSON objects
//! \param json The JSON object to render
//! \param level The current level of the tree
//! \returns The rendered tree as a DOM element
function renderJsonTree(json, level = 0)
{
    const container = document.createElement('div');
    container.style.marginLeft = `${level * 20}px`;

    Object.keys(json).forEach(key =>
    {
        const value = json[key];
        const row = document.createElement('div');
        row.className = 'json-row';

        //* create key element
        const keyElement = document.createElement('span');
        keyElement.className = 'json-key';
        keyElement.textContent = key + ': ';

        //* create value element
        const valueElement = document.createElement('span');
        valueElement.className = 'json-value';

        if (typeof value === 'object' && value !== null)
        {
            valueElement.textContent = '{ }';
            row.appendChild(keyElement);
            row.appendChild(valueElement);
            container.appendChild(row);
            container.appendChild(renderJsonTree(value, level + 1));
        } else if (key === 'thumb' && value.startsWith('http'))
        {
            //* render the thumbnail
            const imgElement = document.createElement('img');
            imgElement.src = value;
            imgElement.alt = 'Thumbnail';
            imgElement.style.maxWidth = '150px';
            row.appendChild(keyElement);
            row.appendChild(imgElement);
            container.appendChild(row);
        } else
        {
            //* primitive value, display directly
            valueElement.textContent = value;
            row.appendChild(keyElement);
            row.appendChild(valueElement);
            container.appendChild(row);
        }
    });

    return container;
}

//! Close the payload modal
function closePayloadModal()
{
    const payloadModal = document.getElementById('payload-modal');
    payloadModal.classList.remove('active');
}



//@ Process Modal ---

//! Open the process status modal and start polling for updates
function openProcessModal()
{
    const processModal = document.getElementById('process-modal');
    processModal.classList.add('active');

    const intervalId = setInterval(() =>
    {
        fetchProcessStatus();

        const processContent = document.getElementById('process-content');
        processContent.scrollTop = processContent.scrollHeight;
    }, 2000);

    // store the interval ID for clearing when modal is closed
    processModal.dataset.intervalId = intervalId;
}

//! Fetch the process status from the server
function fetchProcessStatus()
{
    fetch('/process-status')
        .then(response => response.text())
        .then(data =>
        {
            const processContent = document.getElementById('process-content');

            // check if there's any new output since the last fetch
            if (data !== lastProcessStatus)
            {
                const newContent = data.replace(lastProcessStatus, ''); // get only new content
                const textNode = document.createTextNode(newContent);
                processContent.appendChild(textNode);

                lastProcessStatus = data;

                processContent.scrollTop = processContent.scrollHeight;
            }
        })
        .catch(error =>
        {
            console.error('Error fetching process status:', error);
        });
}

//! Close the process modal and clear the interval
function closeProcessModal()
{
    const processModal = document.getElementById('process-modal');
    processModal.classList.remove('active');

    clearInterval(processModal.dataset.intervalId);
    lastProcessStatus = '';
}



//@ Settings Modal ---

function openSettingsModal()
{
    fetch('/config')
        .then(response => response.json())
        .then(config =>
        {
            const form = document.getElementById('settings-form');
            form.innerHTML = '';

            //* generate input fields based on the config.json keys
            for (const key in config)
            {
                if (typeof config[key] === 'object')
                {
                    if (key === 'SCRIPT_PATHS')
                    {
                        for (const subKey in config[key])
                        {
                            addInputField(form, `SCRIPT_PATHS.${subKey}`, config[key][subKey]);
                        }

                        // Add + and - buttons to show/hide the new script path form
                        const toggleButton = document.createElement('button');
                        toggleButton.type = 'button';
                        toggleButton.textContent = '+ Add Script Path';
                        toggleButton.id = 'toggle-script-fields';
                        toggleButton.onclick = toggleScriptFields;
                        form.appendChild(toggleButton);

                        // Hidden fields for adding a new script path
                        const newScriptContainer = document.createElement('div');
                        newScriptContainer.id = 'new-script-container';
                        newScriptContainer.style.display = 'none';

                        const scriptTypeInput = document.createElement('input');
                        scriptTypeInput.id = 'newScriptType';
                        scriptTypeInput.placeholder = 'New Script Type';

                        const scriptPathInput = document.createElement('input');
                        scriptPathInput.id = 'newScriptPath';
                        scriptPathInput.placeholder = 'New Script Path';

                        const addScriptButton = document.createElement('button');
                        addScriptButton.type = 'button';
                        addScriptButton.textContent = 'Push';
                        addScriptButton.onclick = addNewScriptPath;

                        // Append inputs and add button to the container
                        newScriptContainer.appendChild(scriptTypeInput);
                        newScriptContainer.appendChild(scriptPathInput);
                        newScriptContainer.appendChild(addScriptButton);

                        form.appendChild(newScriptContainer);
                    } else
                    {
                        for (const subKey in config[key])
                        {
                            addInputField(form, `${key}.${subKey}`, config[key][subKey]);
                        }
                    }
                } else
                {
                    addInputField(form, key, config[key]);
                }
            }

            document.getElementById('settings-modal').classList.add('active');
        });
}

//! Toggle the display of the add script form fields
function toggleScriptFields()
{
    const newScriptContainer = document.getElementById('new-script-container');
    const toggleButton = document.getElementById('toggle-script-fields');

    if (newScriptContainer.style.display === 'none')
    {
        newScriptContainer.style.display = 'flex';
        toggleButton.textContent = '- Hide Script Path';
    } else
    {
        newScriptContainer.style.display = 'none';
        toggleButton.textContent = '+ Add Script Path';
    }
}

//! Add new script path to the form dynamically
function addNewScriptPath()
{
    const scriptType = document.getElementById('newScriptType').value;
    const scriptPath = document.getElementById('newScriptPath').value;

    if (scriptType && scriptPath)
    {
        // Check if scriptType already exists in the form to avoid duplicates
        if (!document.getElementById(`SCRIPT_PATHS.${scriptType}`))
        {
            // Create the new input field elements
            const form = document.getElementById('settings-form');
            const newFields = document.createDocumentFragment();

            // Create and add the new label and input for the script type
            const label = document.createElement('label');
            label.textContent = `SCRIPT_PATHS.${scriptType}`;
            label.setAttribute('for', `SCRIPT_PATHS.${scriptType}`);

            const input = document.createElement('input');
            input.type = 'text';
            input.id = `SCRIPT_PATHS.${scriptType}`;
            input.name = `SCRIPT_PATHS.${scriptType}`;
            input.value = scriptPath;

            // Add the label and input to the document fragment
            newFields.appendChild(label);
            newFields.appendChild(input);

            // Find the first existing script field
            const firstScriptField = form.querySelector('input[name^="SCRIPT_PATHS"]');

            // If there's an existing script field, insert before it, otherwise append
            if (firstScriptField)
            {
                form.insertBefore(newFields, firstScriptField.previousElementSibling); // Insert before the first script field
            } else
            {
                form.appendChild(newFields); // Append if there are no existing script paths
            }

            // Clear the input fields after adding
            document.getElementById('newScriptType').value = '';
            document.getElementById('newScriptPath').value = '';
        } else
        {
            alert('This script type already exists. Please enter a unique script type.');
        }
    } else
    {
        alert('Please provide both a script type and path.');
    }
}

//! Helper function to create input fields dynamically with a delete button (only for script paths)
//! \param form The form element to append the input fields to
//! \param name The name of the input field
//! \param value The value of the input field
function addInputField(form, name, value)
{
    const label = document.createElement('label');
    label.textContent = name;
    label.setAttribute('for', name);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = name;
    input.name = name;
    input.value = value;

    form.appendChild(label);
    form.appendChild(input);

    //* Only add delete button for SCRIPT_PATHS entries
    if (name.startsWith('SCRIPT_PATHS'))
    {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = function ()
        {
            label.remove();
            input.remove();
            deleteButton.remove();
        };
        form.appendChild(deleteButton);
    }
}

//! Save the updated settings back to the server
function saveSettings()
{
    const form = document.getElementById('settings-form');
    const formData = new FormData(form);
    const updatedConfig = {};

    //* Convert the form data into the config structure
    for (let [key, value] of formData.entries())
    {
        const keys = key.split('.');
        let currentLevel = updatedConfig;

        while (keys.length > 1)
        {
            const nextKey = keys.shift();
            currentLevel[nextKey] = currentLevel[nextKey] || {};
            currentLevel = currentLevel[nextKey];
        }

        currentLevel[keys[0]] = isNaN(value) ? value : value.trim(); //* Convert numbers, trim text
    }

    fetch('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig)
    })
        .then(response =>
        {
            if (!response.ok)
            {
                throw new Error('Failed to save settings.');
            }
            return response.json(); //* Expect a JSON response from the server
        })
        .then(data =>
        {
            alert(data.message);
            closeSettingsModal();
        })
        .catch(error =>
        {
            alert('Error saving settings: ' + error.message);
        });
}

//! Close the settings modal
function closeSettingsModal()
{
    document.getElementById('settings-modal').classList.remove('active');
}



//@ Initialization, Interval ---

//! Call fetchQueue and fetchLogs instantly on page load
fetchQueue();
fetchLogs();

//! Fetch the queue and logs every 5 seconds
setInterval(() =>
{
    fetchQueue();
    fetchLogs();
}, 5000);