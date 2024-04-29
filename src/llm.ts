import { api } from './api';

const handleProvidersResponse = (response: any) => {
    return response.data.results[0]?.result;
}

export async function assert (
    input: string,
    rules: Record<string, string>,
    chatHistory?: { role: string, content: string }[],
    provider?: string
) {
    return handleProvidersResponse(await api.post('/general/assert', {
        input,
        chatHistory,
        rules,
        temperature: 0,
        providers: [provider || 'openai']
    }));
}

export async function extract (
    input: string,
    outputs: Record<string, string|Record<string, string>>,
    chatHistory?: { role: string, content: string }[],
    provider?: string
) {
    return handleProvidersResponse(await api.post('/general/extract', {
        input,
        chatHistory,
        outputs,
        providers: [provider || 'openai']
    }));
}

export async function improve (
    data: Record<string, unknown>,
    outputs: Record<string, string>,
    chatHistory?: { role: string, content: string }[],
    provider?: string
) {
    return handleProvidersResponse(await api.post('/general/improve', {
        data,
        chatHistory,
        outputs,
        providers: [provider || 'openai']
    }));
}

export async function reply (
    input: string|null|undefined,
    messages: any[],
    instructions: string,
    context: string,
    temperature?: number,
    provider?: string
) {
    return handleProvidersResponse(await api.post('/general/reply', {
        input,
        messages,
        instructions,
        context,
        temperature,
        providers: [provider || 'openai']
    }));
}

// export async function replyStream (
//     input: string|null|undefined,
//     messages: any[],
//     instructions: string,
//     context: string,
// ) {
//     const response = await api.post('/general/reply-stream', {
//         input,
//         messages,
//         instructions,
//         context,
//     }, {
//         responseType: 'stream'
//     });
//
//     console.log(response, response.data);
// }