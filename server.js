/*
 * File: c:\Users\tonyw\Desktop\media scripts\plex-webhook\server.js
 * Project: c:\Users\tonyw\Desktop\media scripts\plex-webhook
 * Created Date: Monday October 21st 2024
 * Author: Tony Wiedman
 * -----
 * Last Modified: Thu October 24th 2024 12:39:10 
 * Modified By: Tony Wiedman
 * -----
 * Copyright (c) 2024 MolexWorks / Tone Web Design
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();



//@ Load the configuration from config.json ----

const configPath = path.join(__dirname, 'config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
let { SCRIPT_PATHS, PORT, LIBRARY_NEW_PARAM, RUN_FLAG, QUEUE_DELAY_MS, LOG_COLORS } = config;
let { SUCCESS, ERROR, INFO, WARN, EVENT, DEBUG, RESET } = LOG_COLORS;



//@ State variables ----

let isProcessing = false;
let processQueue = [];
let currentProcessParams = '';
let lastProcessTime = 0;
let currentProcessOutput = '';



//@ Helper Functions ----

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

        LogMessage(`[RUN] Process: ${processType}, Params: ${processParams}`, INFO);

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
                LogMessage(`[DONE] ${processType} Process Finished Successfully`, SUCCESS);
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
        const nextProcess = processQueue[0]; //* keep the current task in the queue!
        const { processType, params } = nextProcess;
        currentProcessParams = params.join(' ');

        RunProcess(processType, params)
            .then(() =>
            {
                currentProcessParams = '';
                processQueue.shift(); //* remove only after completion
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

//! Log a message with color formatting in the console and pass a clean label to logMessages
function LogMessage(message, color = RESET, payload = null)
{
    let logType;
    if (color === INFO) logType = 'INFO';
    else if (color === SUCCESS) logType = 'SUCCESS';
    else if (color === WARN) logType = 'WARN';
    else if (color === EVENT) logType = 'EVENT';
    else if (color === DEBUG) logType = 'DEBUG';
    else logType = 'ERROR';

    console.log(`${color}${message}${RESET}`);
    logMessages.push({ message, payload, logType });
}


//@ Route Handlers  ----

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

//! Route to fetch config.json
app.get('/config', (req, res) =>
{
    const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json(updatedConfig);
});

//! Route to update config.json
app.post('/config', express.json(), (req, res) =>
{
    try
    {
        const newConfig = req.body;
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));

        //* reload the updated config into memory
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        ({ SCRIPT_PATHS, PORT, LIBRARY_NEW_PARAM, RUN_FLAG, QUEUE_DELAY_MS, LOG_COLORS } = config);
        ({ SUCCESS, ERROR, INFO, WARN, EVENT, DEBUG, RESET } = LOG_COLORS);

        res.status(200).json({ message: 'Configuration updated successfully' });
    } catch (error)
    {
        console.error('Error updating config:', error);
        res.status(500).json({ message: 'Failed to update configuration', error: error.toString() });
    }
});

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

            LogMessage(`[EVENT] ${event}`, EVENT, payload);

            if (event === 'library.new')
            {
                const currentTime = Date.now();

                //* Check if a new process can be queued based on the last process time
                if (currentTime - lastProcessTime >= QUEUE_DELAY_MS)
                {
                    const newProcessParams = [LIBRARY_NEW_PARAM];
                    const processType = 'Kometa';
                    const scriptPath = SCRIPT_PATHS[processType];

                    LogMessage(`[QUEUE] Process: ${processType}, Params: ${newProcessParams}`, INFO);

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
                    LogMessage(`[WAIT] Queue delay not met. Wait for ${Math.ceil(timeLeft / 1000)} more seconds`, ERROR);
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
    LogMessage(`Server is running on http://localhost:${PORT}`, DEBUG);
});
