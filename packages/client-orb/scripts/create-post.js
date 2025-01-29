const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);

try {
    const response = await fetch('https://eliza.bonsai.meme/c3bd776c-4465-037f-9c7a-bf94dfba78d9/orb/create-post', {
        method: 'POST',
        signal: controller.signal
    });
    const result = await response.text();
    console.log(result);
} catch (error) {
    if (error.name === 'AbortError') {
        console.error('Request timed out after 30 seconds');
    } else {
        console.error('Error:', error);
    }
} finally {
    clearTimeout(timeout);
}