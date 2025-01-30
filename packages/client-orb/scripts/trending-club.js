const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);

try {
    const response = await fetch('https://eliza.bonsai.meme/c3bd776c-4465-037f-9c7a-bf94dfba78d9/trending-club', {
        method: 'POST',
        signal: controller.signal
    });
    const result = await response.text();
    console.log(result);
} catch (error) {
    if (error.name === 'AbortError') {
        console.log('Stopped waiting for response after 30 seconds');
        console.log('Note: Server is still processing');
    } else {
        console.error('Error:', error);
    }
} finally {
    clearTimeout(timeout);
}