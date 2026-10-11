
const formulario = document.getElementById("form-frete");
const campoCep = document.getElementById("cep");
const campoNumero = document.getElementById("numero");
const campoComplemento = document.getElementById("complemento");
const botaoConsultar = document.getElementById("consultar-cep");
const botaoCalcular = document.getElementById("calcular");
const mensagem = document.getElementById("mensagem");
const painelEndereco = document.getElementById("endereco");
const painelResultado = document.getElementById("resultado");

// Origem: UNINASSAU Parangaba, Fortaleza - CE.
const ORIGEM = {
    nome: "UNINASSAU Parangaba",
    endereco: "Rua Germano Franck, 613, Parangaba, Fortaleza, CE, Brasil"
};

// Tarifas ilustrativas. Altere conforme a regra de frete desejada.
// Não são tarifas oficiais do Uber Moto.
const TARIFAS = {
    base: 3.00,
    porKm: 1.60,
    porMinuto: 0.20,
    minimo: 6.00
};

let enderecoConsultado = null;
let ultimaConsulta = 0;

const dinheiro = valor =>
    valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });

function mostrarMensagem(texto, sucesso = false) {
    mensagem.textContent = texto;
    mensagem.classList.toggle("sucesso", sucesso);
}

function limparResultado() {
    painelResultado.classList.add("escondido");
}

function formatarCep(valor) {
    const numeros = valor.replace(/\D/g, "").slice(0, 8);

    return numeros.length > 5
        ? numeros.slice(0, 5) + "-" + numeros.slice(5)
        : numeros;
}

campoCep.addEventListener("input", () => {
    campoCep.value = formatarCep(campoCep.value);
    enderecoConsultado = null;
    painelEndereco.classList.add("escondido");
    limparResultado();
    mostrarMensagem("");
});

campoNumero.addEventListener("input", limparResultado);
campoComplemento.addEventListener("input", limparResultado);

// Consulta o endereço pela API pública ViaCEP.
async function consultarCep() {
    const cep = campoCep.value.replace(/\D/g, "");

    if (!/^\d{8}$/.test(cep)) {
        throw new Error("Digite um CEP válido com 8 números.");
    }

    const resposta = await fetch(
        `https://viacep.com.br/ws/${cep}/json/`
    );

    if (!resposta.ok) {
        throw new Error("Não foi possível consultar o CEP.");
    }

    const dados = await resposta.json();

    if (dados.erro) {
        throw new Error("CEP não encontrado. Confira os números.");
    }

    if (dados.uf !== "CE" || dados.localidade !== "Fortaleza") {
        throw new Error(
            "Por enquanto, este simulador atende somente CEPs de Fortaleza - CE."
        );
    }

    if (!dados.logradouro && !dados.bairro) {
        throw new Error(
            "Não foi possível identificar a rua ou o bairro desse CEP."
        );
    }

    return dados;
}

function mostrarEndereco(dados) {
    document.getElementById("rua").textContent =
        dados.logradouro || "Logradouro não informado";

    document.getElementById("bairro").textContent =
        dados.bairro || "Bairro não informado";

    document.getElementById("cidade").textContent =
        dados.localidade;

    document.getElementById("estado").textContent =
        `${dados.estado || dados.uf} (${dados.uf})`;

    painelEndereco.classList.remove("escondido");
}

botaoConsultar.addEventListener("click", async () => {
    botaoConsultar.disabled = true;
    mostrarMensagem("Consultando CEP...");
    limparResultado();

    try {
        enderecoConsultado = await consultarCep();
        mostrarEndereco(enderecoConsultado);

        mostrarMensagem(
            "Endereço encontrado! Agora você pode calcular o frete.",
            true
        );
    } catch (erro) {
        enderecoConsultado = null;
        painelEndereco.classList.add("escondido");
        mostrarMensagem(erro.message);
    } finally {
        botaoConsultar.disabled = false;
    }
});

// Usa o Nominatim/OpenStreetMap para localizar um endereço.
// A consulta é limitada para evitar chamadas desnecessárias.
async function geocodificar(endereco) {
    const url = new URL(
        "https://nominatim.openstreetmap.org/search"
    );

    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("q", endereco);

    const resposta = await fetch(url);

    if (!resposta.ok) {
        throw new Error(
            "O serviço de mapas está indisponível. Tente novamente."
        );
    }

    const resultados = await resposta.json();

    if (!resultados.length) {
        throw new Error(
            "Não foi possível localizar o endereço no mapa."
        );
    }

    return {
        lat: Number(resultados[0].lat),
        lon: Number(resultados[0].lon),
        nome: resultados[0].display_name
    };
}

// Calcula a rota pelas ruas usando o perfil de carro do OSRM.
// É uma aproximação da distância viária, não uma rota específica de moto.
async function calcularRota(origem, destino) {
    const coordenadas =
        `${origem.lon},${origem.lat};${destino.lon},${destino.lat}`;

    const url =
        `https://router.project-osrm.org/route/v1/driving/${coordenadas}` +
        "?overview=false&steps=false";

    const resposta = await fetch(url);

    if (!resposta.ok) {
        throw new Error("Não foi possível calcular a rota.");
    }

    const dados = await resposta.json();

    if (dados.code !== "Ok" || !dados.routes?.length) {
        throw new Error(
            "Não foi encontrada uma rota entre a origem e o destino."
        );
    }

    return {
        metros: dados.routes[0].distance,
        segundos: dados.routes[0].duration
    };
}

function calcularPreco(distanciaKm, duracaoMin) {
    const subtotal =
        TARIFAS.base +
        distanciaKm * TARIFAS.porKm +
        duracaoMin * TARIFAS.porMinuto;

    return Math.max(subtotal, TARIFAS.minimo);
}

function mostrarResultado(rota, destino) {
    const distanciaKm = rota.metros / 1000;
    const duracaoMin = rota.segundos / 60;
    const preco = calcularPreco(distanciaKm, duracaoMin);

    document.getElementById("distancia").textContent =
        `${distanciaKm.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        })} km`;

    document.getElementById("tempo").textContent =
        `${Math.max(1, Math.round(duracaoMin))} min`;

    document.getElementById("preco").textContent = dinheiro(preco);

    document.getElementById("destino-final").textContent =
        destino.nome;

    document.getElementById("tarifa-base").textContent =
        dinheiro(TARIFAS.base);

    document.getElementById("tarifa-km").textContent =
        dinheiro(TARIFAS.porKm);

    document.getElementById("tarifa-minuto").textContent =
        dinheiro(TARIFAS.porMinuto);

    const urlMapa = new URL("https://www.openstreetmap.org/directions");

    urlMapa.searchParams.set(
        "engine",
        "fossgis_osrm_car"
    );

    urlMapa.searchParams.set(
        "route",
        `${ORIGEM.lat},${ORIGEM.lon};${destino.lat},${destino.lon}`
    );

    document.getElementById("abrir-rota").href =
        `https://www.google.com/maps/dir/?api=1&origin=${
            encodeURIComponent(ORIGEM.endereco)
        }&destination=${encodeURIComponent(destino.nome)}&travelmode=driving`;

    painelResultado.classList.remove("escondido");
}

// Calcula a estimativa completa.
formulario.addEventListener("submit", async evento => {
    evento.preventDefault();

    if (botaoCalcular.disabled) return;

    const agora = Date.now();

    // Evita envios repetidos acidentais.
    if (agora - ultimaConsulta < 1500) return;
    ultimaConsulta = agora;

    botaoCalcular.disabled = true;
    limparResultado();
    mostrarMensagem("Buscando a origem, o destino e a rota...");

    try {
        if (!enderecoConsultado) {
            enderecoConsultado = await consultarCep();
            mostrarEndereco(enderecoConsultado);
        }

        if (campoNumero.value.trim() &&
            !enderecoConsultado.logradouro) {
            throw new Error(
                "O CEP não retornou o nome da rua. Não é possível usar o número com segurança."
            );
        }

        const partesDestino = [
            enderecoConsultado.logradouro,
            campoNumero.value.trim(),
            campoComplemento.value.trim(),
            enderecoConsultado.bairro,
            enderecoConsultado.localidade,
            enderecoConsultado.uf,
            "Brasil"
        ].filter(Boolean);

        const enderecoDestino = partesDestino.join(", ");

        // Localiza a origem e o destino pelas descrições.
        const [origem, destino] = await Promise.all([
            geocodificar(ORIGEM.endereco),
            geocodificar(enderecoDestino)
        ]);

        const rota = await calcularRota(origem, destino);

        if (rota.metros <= 0) {
            throw new Error(
                "A rota retornou distância inválida. Confira o destino."
            );
        }

        mostrarResultado(rota, destino);

        mostrarMensagem(
            "Estimativa calculada com sucesso. Confira o aviso sobre o preço.",
            true
        );
    } catch (erro) {
        mostrarMensagem(
            erro.message ||
            "Ocorreu um erro ao calcular o frete. Tente novamente."
        );
    } finally {
        botaoCalcular.disabled = false;
    }
});
