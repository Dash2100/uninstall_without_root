const runADBcommand = (command) => {
    const ADBResponse = window.executeAdbCommand(command);

    console.log('[adb] ADB command:', command);

    // append command to terminal
    appendToTerminal(`> ${command}`, 'command');

    // Return the Promise so it can be chained
    return ADBResponse
        .then((response) => {
            // console.log('[adb] ADB response:', response);

            if (response) {
                appendToTerminal(response, 'response');
            } else {
                appendToTerminal('(No output)', 'response');
            }

            return response;
        })
        .catch((error) => {
            console.error('[adb] ADB error:', error);
            appendToTerminal(error, 'error');

            return Promise.reject(error);
        });
}