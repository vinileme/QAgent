import express from 'express';
import bodyParser from 'body-parser';
import { getOllamaHost } from './lib/config.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(bodyParser.json());

// Rota principal que a Amazon vai acessar
app.post('/alexa', async (req, res) => {
    try {
        const { request } = req.body;

        // Verifica se é o evento de iniciar a skill ("Alexa, abra o Jarvinis")
        if (request.type === 'LaunchRequest') {
            return res.json(buildAlexaResponse("Olá Vini, JARVINIS online. Em que posso ajudar?"));
        }

        // Verifica se é uma intenção (O usuário falou algo)
        if (request.type === 'IntentRequest') {
            // Pegamos o texto que o usuário falou (configuraremos o slot como 'Query' na Amazon)
            let userSpokenText = "";
            
            if (request.intent && request.intent.slots && request.intent.slots.Query) {
                userSpokenText = request.intent.slots.Query.value;
            }

            if (!userSpokenText) {
                return res.json(buildAlexaResponse("Desculpe, não consegui entender a pergunta."));
            }

            console.log("🗣️ Alexa ouviu:", userSpokenText);

            // Criar um controlador para abortar a requisição se demorar muito (Limite da Alexa é 8s)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6500); // 6.5 segundos de limite máximo

            try {
                // Envia a pergunta para o Ollama (Nosso Cérebro)
                const ollamaResponse = await fetch(`${getOllamaHost()}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'jarvinis', // Nosso modelo blindado
                        prompt: "Responda à seguinte pergunta ou explique o seguinte tópico: '" + userSpokenText + "'\n\n(Regra Absoluta de Voz: Seja extremamente conciso. Dê uma resposta curta e direta de no máximo 2 ou 3 frases. Não faça listas longas.)",
                        stream: false,
                        keep_alive: -1 // Mantém o modelo na memória para a próxima resposta ser instantânea
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                const ollamaData = await ollamaResponse.json();
                const jarvinisAnswer = ollamaData.response || "Desculpe, houve um erro no processamento do modelo.";
                
                console.log("🤖 JARVINIS Respondeu:", jarvinisAnswer);

                // Devolve a resposta para a Alexa falar
                return res.json(buildAlexaResponse(jarvinisAnswer));
            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    console.log("⏱️ Timeout: Ollama demorou mais de 6.5 segundos para responder.");
                    return res.json(buildAlexaResponse("A sua pergunta me fez pensar demais e eu demorei para processar. Pode ser mais específico?"));
                } else {
                    console.error("❌ Erro no Servidor Ollama:", error);
                    return res.json(buildAlexaResponse("Desculpe, ocorreu um erro de conexão com meu cérebro local."));
                }
            }
        }

        // Caso base
        return res.json(buildAlexaResponse("Comando não reconhecido."));
    } catch (error) {
        console.error("❌ Erro no Servidor:", error);
        return res.json(buildAlexaResponse("Desculpe, meu cérebro local está offline ou ocorreu um erro."));
    }
});

// Função auxiliar para formatar a resposta do jeito exato que a Alexa exige
function buildAlexaResponse(speechText) {
    return {
        version: '1.0',
        response: {
            outputSpeech: {
                type: 'PlainText',
                text: speechText
            },
            shouldEndSession: false // False para ela ficar ouvindo e vocês conversarem naturalmente
        }
    };
}

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor da Alexa rodando na porta ${PORT}`);
    console.log(`📡 Aguardando o túnel do Ngrok para interações de voz...\n`);
});
