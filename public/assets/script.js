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

            // if empty queue
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

//! View the payload in a modal
function viewPayload(index)
{
    fetch('/logs')
        .then(response => response.json())
        .then(data =>
        {
            const payloadModal = document.getElementById('payload-modal');
            const payloadContent = document.getElementById('payload-content');
            payloadContent.textContent = JSON.stringify(data.logs[index].payload, null, 2);
            payloadModal.classList.add('active');
        });
}

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

                // update to the latest content
                lastProcessStatus = data;

                processContent.scrollTop = processContent.scrollHeight;
            }
        });
}

//! Close the process status modal
function closeProcessModal()
{
    const processModal = document.getElementById('process-modal');
    processModal.classList.remove('active');

    clearInterval(processModal.dataset.intervalId); // clear the interval
    lastProcessStatus = ''; // reset the last process status
}

//! Close the payload modal
function closePayloadModal()
{
    const payloadModal = document.getElementById('payload-modal');
    payloadModal.classList.remove('active');
}

//! Call fetchQueue and fetchLogs instantly on page load
fetchQueue();
fetchLogs();

//! Fetch the queue and logs every 5 seconds
setInterval(() =>
{
    fetchQueue();
    fetchLogs();
}, 5000);