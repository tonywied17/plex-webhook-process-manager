/*
 * File: c:\Users\tonyw\Desktop\media scripts\plex-webhook\server.js
 * Project: c:\Users\tonyw\Desktop\media scripts\plex-webhook
 * Created Date: Monday October 21st 2024
 * Author: Tony Wiedman
 * -----
 * Last Modified: Wed October 23rd 2024 4:52:53 
 * Modified By: Tony Wiedman
 * -----
 * Copyright (c) 2024 MolexWorks / Tone Web Design
 */

const express = require('express');
const { spawn } = require('child_process');

//@ Configuration ----
const SCRIPT_PATHS = {
    'Kometa': 'C:\\Users\\tonyw\\Kometa\\kometa.py',
};
const PORT = 5000;
const SUCCESS = '\x1b[32m';
const ERROR = '\x1b[31m';
const INFO = '\x1b[34m';
const WARN = '\x1b[33m';
const RESET = '\x1b[0m';
const LIBRARY_NEW_PARAM = '--collections-only';
const RUN_FLAG = '--run';
const QUEUE_DELAY_MS = 30 * 60 * 1000; // 30 minutes

//@ State variables ----
let isProcessing = false;
let processQueue = [];
let currentProcessParams = '';
let lastProcessTime = 0;
let currentProcessOutput = '';


//! Run a process with the given parameters and type
//! \param processType: A string representing the type of process (e.g., 'Kometa', 'OtherProcess')
//! \param params: Array of parameters to pass to the script
function RunProcess(processType, params = [])
{
    return new Promise((resolve, reject) =>
    {
        const scriptPath = SCRIPT_PATHS[processType];

        if (!scriptPath)
        {
            LogMessage(`Error: No script found for process type: ${processType}`, ERROR);
            return reject(new Error(`No script found for process type: ${processType}`));
        }

        processType === 'Kometa' && params.push(RUN_FLAG);

        const processParams = params.join(' ');

        LogMessage(`Running ${processType} process with params: ${processParams}`, INFO);

        const process = spawn('python', [scriptPath, ...params], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            shell: true
        });

        currentProcessOutput = ''; 

        process.stdout.on('data', (data) =>
        {
            currentProcessOutput += data.toString();
        });

        process.stderr.on('data', (data) =>
        {
            currentProcessOutput += `${data.toString()}`;
        });

        process.on('exit', (code) =>
        {
            if (code === 0)
            {
                LogMessage(`${processType} Process Finished Successfully`, SUCCESS);
                resolve();
            } else
            {
                LogMessage(`${processType} Process Failed with exit code: ${code}`, ERROR);
                reject(new Error(`${processType} process failed with exit code: ${code}`));
            }
        });

        process.unref();
    });
}

//! Process the next item in the queue
function ProcessNextInQueue()
{
    if (processQueue.length > 0)
    {
        const nextProcess = processQueue[0]; // Keep the current task in the queue
        const { processType, params } = nextProcess;
        currentProcessParams = params.join(' ');

        RunProcess(processType, params)
            .then(() =>
            {
                currentProcessParams = '';
                processQueue.shift(); // Remove only after completion
                ProcessNextInQueue();
            })
            .catch(err =>
            {
                LogMessage(err.message, ERROR);
            })
            .finally(() =>
            {
                isProcessing = false;
            });
    } else
    {
        isProcessing = false;
        currentProcessParams = '';
    }
}

//! Extract the payload from the multipart data
//! \param data: The raw multipart data
//! \param headers: The headers object from the request
//! \return The extracted payload object
function ExtractPayload(data, headers)
{
    const boundary = headers['content-type']?.split('boundary=')[1];
    if (!boundary) throw new Error('Boundary not found');

    const parts = data.split(`--${boundary}`);
    let payload = {};

    parts.forEach(part =>
    {
        if (part.includes('Content-Disposition'))
        {
            const nameMatch = part.match(/name="(.+?)"/);
            const name = nameMatch && nameMatch[1];
            const value = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            if (name && value) payload[name] = value;
        }
    });

    try
    {
        if (payload.payload)
        {
            payload.payload = JSON.parse(payload.payload);
        }
    } catch (err)
    {
        throw new Error('Invalid JSON payload');
    }

    return payload;
}

//! Log a message with color formatting
function LogMessage(message, color = RESET, payload = null)
{
    console.log(`${color}${message}${RESET}`);
    logMessages.push({ message, payload });
}



//@ Route Handlers  ----

const path = require('path');
const app = express();
let logMessages = [];

//! Route to serve the index.html file
app.get('/', (req, res) =>
{
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//! Route to get the current process queue
app.get('/queue', (req, res) =>
{
    res.json({ queue: processQueue });
});

//! Route to get log messages
app.get('/logs', (req, res) =>
{
    res.json({ logs: logMessages });
});

//! Route to get the current process status (stdout)
app.get('/process-status', (req, res) =>
{
    res.send(currentProcessOutput || 'No process is running currently.');
});

app.use(express.static('public'));


//! Webhook Route
app.post('/webhook', (req, res) =>
{
    let data = '';

    req.on('data', chunk => { data += chunk; });

    req.on('end', () =>
    {
        try
        {
            const payload = ExtractPayload(data, req.headers);
            const event = payload.payload?.event || (payload.Metadata && payload.Metadata.event);

            LogMessage(`Received event: ${event}`, WARN, payload); 

            if (event === 'library.new')
            {
                const currentTime = Date.now();

                //* Check if a new process can be queued based on the last process time
                if (currentTime - lastProcessTime >= QUEUE_DELAY_MS)
                {
                    const newProcessParams = [LIBRARY_NEW_PARAM];
                    const processType = 'Kometa';
                    const scriptPath = SCRIPT_PATHS[processType];

                    LogMessage(`+ Queueing ${processType} Collections Process`, WARN);

                    //* Push the process to the queue
                    processQueue.push({ processType, scriptPath, params: newProcessParams });
                    lastProcessTime = currentTime; //* Update last process time (for a custom collections queue delay)

                    if (!isProcessing)
                    {
                        isProcessing = true;
                        ProcessNextInQueue();
                    }

                    return res.send('New process queued.');
                } else
                {
                    const timeLeft = QUEUE_DELAY_MS - (currentTime - lastProcessTime);
                    LogMessage(`Queue delay not met. Wait for ${Math.ceil(timeLeft / 1000)} more seconds`, WARN);
                    return res.status(429).send('Queue delay not met. Please try again later.');
                }
            } else
            {
                return res.send('Ignored');
            }
        } catch (error)
        {
            LogMessage(error.message, ERROR);
            res.status(400).send(error.message);
        }
    });
});


//! Start the server
app.listen(PORT, () =>
{
    LogMessage(`Server is running on http://localhost:${PORT}`, INFO);
});
