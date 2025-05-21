const http = require('http');
const https = require('https');

// Constantes para substituir números mágicos e valores fixos
const API_BASE_URL = 'https://swapi.dev/api/';
const TIMEOUT_MS_DEFAULT = 5000;
const POPULATION_THRESHOLD = 1000000000;
const DIAMETER_THRESHOLD = 10000;
const MAX_STARSHIPS_TO_SHOW = 3;
const MAX_VEHICLE_ID = 4;

// Estado global encapsulado
const state = {
    cache: {},
    debugMode: true,
    timeout: TIMEOUT_MS_DEFAULT,
    errorCount: 0,
    fetchCount: 0,
    totalDataSize: 0,
    lastVehicleId: 1,
};

// Função para logar mensagens no modo debug
function logDebug(...args) {
    if (state.debugMode) {
        console.log('[DEBUG]', ...args);
    }
}

// Função para buscar dados na API com cache e tratamento de erros
async function fetchFromApi(endpoint) {
    if (state.cache[endpoint]) {
        logDebug('Usando cache para:', endpoint);
        return state.cache[endpoint];
    }

    return new Promise((resolve, reject) => {
        let data = '';
        const request = https.get(API_BASE_URL + endpoint, { rejectUnauthorized: false }, (response) => {
            if (response.statusCode >= 400) {
                state.errorCount++;
                return reject(new Error(`Erro HTTP ${response.statusCode} ao acessar ${endpoint}`));
            }

            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    state.cache[endpoint] = json;
                    state.totalDataSize += Buffer.byteLength(data, 'utf8');
                    logDebug(`Dados carregados para ${endpoint}, tamanho: ${data.length} bytes, cache total: ${Object.keys(state.cache).length}`);
                    resolve(json);
                } catch (error) {
                    state.errorCount++;
                    reject(error);
                }
            });
        });

        request.on('error', error => {
            state.errorCount++;
            reject(error);
        });

        request.setTimeout(state.timeout, () => {
            request.abort();
            state.errorCount++;
            reject(new Error(`Timeout na requisição para ${endpoint}`));
        });
    });
}

// Funções para exibir dados organizadas e específicas
function printCharacterInfo(character) {
    console.log('Personagem:', character.name);
    console.log('Altura:', character.height);
    console.log('Massa:', character.mass);
    console.log('Aniversário:', character.birth_year);
    if (character.films && character.films.length > 0) {
        console.log(`Aparece em ${character.films.length} filmes`);
    }
}

function printStarshipsInfo(starships) {
    console.log('\nTotal de Starships:', starships.count);
    for (let i = 0; i < Math.min(MAX_STARSHIPS_TO_SHOW, starships.results.length); i++) {
        const starship = starships.results[i];
        console.log(`\nStarship ${i + 1}:`);
        console.log('Nome:', starship.name);
        console.log('Modelo:', starship.model);
        console.log('Fabricante:', starship.manufacturer);
        console.log('Custo:', starship.cost_in_credits !== 'unknown' ? `${starship.cost_in_credits} créditos` : 'desconhecido');
        console.log('Velocidade máxima atmosférica:', starship.max_atmosphering_speed);
        console.log('Classificação do hiperespaço:', starship.hyperdrive_rating);
        if (starship.pilots && starship.pilots.length > 0) {
            console.log(`Pilotos: ${starship.pilots.length}`);
        }
    }
}

function printLargePlanets(planets) {
    console.log('\nPlanetas grandes e populosos:');
    planets.results.forEach(planet => {
        if (
            planet.population !== 'unknown' &&
            parseInt(planet.population) > POPULATION_THRESHOLD &&
            planet.diameter !== 'unknown' &&
            parseInt(planet.diameter) > DIAMETER_THRESHOLD
        ) {
            console.log(`${planet.name} - População: ${planet.population} - Diâmetro: ${planet.diameter} - Clima: ${planet.climate}`);
            if (planet.films && planet.films.length > 0) {
                console.log(`  Aparece em ${planet.films.length} filmes`);
            }
        }
    });
}

function printFilmsInfo(films) {
    const sortedFilms = films.results.slice().sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
    console.log('\nFilmes de Star Wars em ordem cronológica:');
    sortedFilms.forEach((film, index) => {
        console.log(`${index + 1}. ${film.title} (${film.release_date})`);
        console.log(`   Diretor: ${film.director}`);
        console.log(`   Produtor: ${film.producer}`);
        console.log(`   Personagens: ${film.characters.length}`);
        console.log(`   Planetas: ${film.planets.length}`);
    });
}

function printVehicleInfo(vehicle) {
    console.log('\nVeículo em destaque:');
    console.log('Nome:', vehicle.name);
    console.log('Modelo:', vehicle.model);
    console.log('Fabricante:', vehicle.manufacturer);
    console.log('Custo:', vehicle.cost_in_credits !== 'unknown' ? `${vehicle.cost_in_credits} créditos` : 'desconhecido');
    console.log('Comprimento:', vehicle.length);
    console.log('Tripulação:', vehicle.crew);
    console.log('Passageiros:', vehicle.passengers);
}

// Função principal que controla fluxo e chama as outras funções
async function fetchAndDisplayData() {
    try {
        logDebug('Iniciando busca dos dados...');
        state.fetchCount++;

        const character = await fetchFromApi(`people/${state.lastVehicleId}`);
        printCharacterInfo(character);

        const starships = await fetchFromApi('starships/?page=1');
        printStarshipsInfo(starships);

        const planets = await fetchFromApi('planets/?page=1');
        printLargePlanets(planets);

        const films = await fetchFromApi('films/');
        printFilmsInfo(films);

        if (state.lastVehicleId <= MAX_VEHICLE_ID) {
            const vehicle = await fetchFromApi(`vehicles/${state.lastVehicleId}`);
            printVehicleInfo(vehicle);
            state.lastVehicleId++;
        }

        if (state.debugMode) {
            console.log('\nEstatísticas:');
            console.log('Requisições feitas:', state.fetchCount);
            console.log('Entradas no cache:', Object.keys(state.cache).length);
            console.log('Tamanho total dos dados:', state.totalDataSize, 'bytes');
            console.log('Quantidade de erros:', state.errorCount);
        }
    } catch (error) {
        console.error('Erro ao buscar dados:', error.message);
        state.errorCount++;
    }
}

// Configura debug e timeout via argumentos da linha de comando
function configureFromArgs() {
    const args = process.argv.slice(2);
    if (args.includes('--no-debug')) {
        state.debugMode = false;
    }
    if (args.includes('--timeout')) {
        const index = args.indexOf('--timeout');
        if (index !== -1 && index < args.length - 1) {
            const timeoutValue = parseInt(args[index + 1]);
            if (!isNaN(timeoutValue)) {
                state.timeout = timeoutValue;
            }
        }
    }
}

// Criação do servidor HTTP para interface simples e endpoints
function createServer() {
    const server = http.createServer((req, res) => {
        if (req.url === '/' || req.url === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>Star Wars API Demo</title>
                        <style>
                            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                            h1 { color: #FFE81F; background-color: #000; padding: 10px; }
                            button { background-color: #FFE81F; border: none; padding: 10px 20px; cursor: pointer; }
                            .footer { margin-top: 50px; font-size: 12px; color: #666; }
                            pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
                        </style>
                    </head>
                    <body>
                        <h1>Star Wars API Demo</h1>
                        <p>Esta pagina demonstra a busca de dados da API Star Wars.</p>
                        <p>Confira o console do servidor para os resultados da API.</p>
                        <button onclick="fetchData()">Buscar dados</button>
                        <div id="results"></div>
                        <script>
                            function fetchData() {
                                document.getElementById('results').innerHTML = '<p>Carregando dados...</p>';
                                fetch('/api')
                                    .then(res => res.text())
                                    .then(() => {
                                        alert('Requisição feita! Veja o console do servidor.');
                                        document.getElementById('results').innerHTML = '<p>Dados carregados! Veja o console do servidor.</p>';
                                    })
                                    .catch(err => {
                                        document.getElementById('results').innerHTML = '<p>Erro: ' + err.message + '</p>';
                                    });
                            }
                        </script>
                        <div class="footer">
                            <p>Requisições API: ${state.fetchCount} | Entradas no cache: ${Object.keys(state.cache).length} | Erros: ${state.errorCount}</p>
                            <pre>Debug: ${state.debugMode ? 'ON' : 'OFF'} | Timeout: ${state.timeout}ms</pre>
                        </div>
                    </body>
                </html>
            `);
        } else if (req.url === '/api') {
            fetchAndDisplayData();
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Confira o console do servidor para os resultados');
        } else if (req.url === '/stats') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                apiCalls: state.fetchCount,
                cacheSize: Object.keys(state.cache).length,
                dataSize: state.totalDataSize,
                errors: state.errorCount,
                debug: state.debugMode,
                timeout: state.timeout
            }));
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Página não encontrada');
        }
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}/`);
        logDebug('Modo debug ativado');
        logDebug(`Timeout configurado para ${state.timeout} ms`);
    });
}

// Execução principal
configureFromArgs();
createServer();
