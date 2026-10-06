(function() {
    'use strict';

    if (window.__nativeInfinityContentInstalado) return;
    window.__nativeInfinityContentInstalado = true;

    const IS_NATIVE_TAB = /(^|\.)native-infinity\.com\.br$/.test(window.location.hostname);
    let chamadaTocando = false;
    let chamadaAtiva = false;
    let micEstadoAtual = { mutado: false, tracks: 0 };
    let alvoJaEstavaPresente = false;
    let botaoAtendimentoCache = null;
    let modoSilencioso = false;
    let configuracaoCarregada = false;
    let teclaSegurar = 'Alt+Insert';
    let segurando = false;
    let timerSegurar = null;
    let ultimoBotaoAtendido = null;
    let blacklist = [];
    let blacklistEmEdicao = false;

    function lerNumerosBlacklist(texto) {
        const linhas = texto.split(/[\r\n;,]+/).map(n => n.trim()).filter(Boolean);
        const entradas = linhas.flatMap(linha => {
            const partes = linha.split(/\s+/);
            return partes.length > 1 && partes.every(n => /^\+?\d{10,13}$/.test(n)) ? partes : [linha];
        });
        if (entradas.some(n => !/^[+\d\s().-]+$/.test(n) || !/^\d{10,11}$/.test(normalizarTelefone(n)))) {
            throw new Error('Confira os números: use DDD + telefone, um por linha.');
        }
        return [...new Set(entradas.map(normalizarTelefone))];
    }

    function normalizarTelefone(valor) {
        let numero = String(valor || '').replace(/\D/g, '');
        if (/^55\d{10,11}$/.test(numero)) numero = numero.slice(2);
        return numero;
    }

    function obterTelefoneChamada(botao) {
        // Procura no contêiner mais próximo do botão, sem confundir com outros cartões.
        for (let area = botao.parentElement; area; area = area.parentElement) {
            const numeros = new Set();
            for (const linha of area.querySelectorAll('div.flex.items-center.space-x-1')) {
                if (!elementoEstaVisivel(linha) ||
                    !linha.querySelector('svg path[d^="M97.333 506.966"]')) continue;
                for (const texto of linha.querySelectorAll('p')) {
                    const valor = texto.textContent.trim();
                    if (!/^[+\d\s().-]+$/.test(valor)) continue;
                    const numero = normalizarTelefone(valor);
                    if (/^\d{10,11}$/.test(numero)) numeros.add(numero);
                }
            }
            if (numeros.size) return numeros.size === 1 ? [...numeros][0] : null;
        }
        return null;
    }

    function atendimentoPermitido(botao) {
        if (!configuracaoCarregada) return false;
        if (!blacklist.length) return true;
        const telefone = obterTelefoneChamada(botao);
        // A ausência de identificação não significa que o cliente está bloqueado.
        return telefone === null || !blacklist.includes(telefone);
    }

    function atualizarListaBlacklist() {
        const shadow = document.getElementById('native-infinity-tools-host')?.shadowRoot;
        if (!shadow) return;
        shadow.getElementById('blacklist-saved-title').textContent = `Números salvos (${blacklist.length})`;
        const lista = shadow.getElementById('blacklist-saved');
        lista.replaceChildren();
        if (!blacklist.length) lista.textContent = 'Nenhum número bloqueado.';
        for (const numero of blacklist) {
            const linha = document.createElement('div');
            linha.className = 'blacklist-item';
            const telefone = document.createElement('span');
            telefone.textContent = numero;
            const remover = document.createElement('button');
            remover.type = 'button';
            remover.textContent = 'Remover';
            remover.setAttribute('aria-label', `Remover ${numero} da Black List`);
            remover.addEventListener('click', async () => {
                remover.disabled = true;
                try {
                    const salvos = await chrome.storage.local.get('blacklist');
                    const numeros = (salvos.blacklist || []).map(normalizarTelefone).filter(n => n !== numero);
                    await chrome.storage.local.set({ blacklist: numeros });
                    blacklist = numeros;
                    atualizarListaBlacklist();
                    shadow.getElementById('blacklist-status').textContent = `${numero} removido.`;
                } catch {
                    remover.disabled = false;
                    shadow.getElementById('blacklist-status').textContent = 'Não foi possível remover. Tente novamente.';
                }
            });
            linha.append(telefone, remover);
            lista.appendChild(linha);
        }
    }

    function atualizarUtilidades() {
        const shadow = document.getElementById('native-infinity-tools-host')?.shadowRoot;
        if (!shadow) return;
        const silencio = shadow.getElementById('silent-row');
        silencio.classList.toggle('active', modoSilencioso);
        silencio.setAttribute('aria-pressed', String(modoSilencioso));
        silencio.textContent = modoSilencioso ? 'Modo Silencioso: ligado' : 'Modo Silencioso: desligado';
        const hold = shadow.getElementById('hold-row');
        hold.classList.toggle('active', segurando);
        hold.setAttribute('aria-pressed', String(segurando));
        hold.textContent = segurando ? 'Atendimento automático ativo' : 'Segure para atender';
        shadow.getElementById('hold-key').value = teclaSegurar;
    }

    function atenderEnquantoSegura() {
        if (!segurando) return;
        if (IS_NATIVE_TAB) dispararAtendimento();
        else chrome.runtime.sendMessage({ action: 'atender_ligacao_pelo_modal' }).catch(pararDeSegurar);
    }

    function iniciarSegurar() {
        if (segurando) return;
        segurando = true;
        atualizarUtilidades();
        atenderEnquantoSegura();
        timerSegurar = setInterval(atenderEnquantoSegura, 200);
    }

    function pararDeSegurar() {
        segurando = false;
        clearInterval(timerSegurar);
        timerSegurar = null;
        atualizarUtilidades();
    }

    function aplicarPreferencias(prefs) {
        modoSilencioso = prefs.modoSilencioso === true;
        blacklist = Array.isArray(prefs.blacklist) ? [...new Set(prefs.blacklist.map(normalizarTelefone).filter(n => /^\d{10,11}$/.test(n)))] : [];
        atualizarListaBlacklist();
        if (['Alt+Insert', 'Ctrl+Insert', 'Shift+Insert'].includes(prefs.teclaSegurar)) teclaSegurar = prefs.teclaSegurar;
        configuracaoCarregada = true;
        if (modoSilencioso) document.getElementById('native-infinity-modal-host')?.remove();
        else if (chamadaTocando) criarModalChamada();
        atualizarUtilidades();
    }

    chrome.storage.local.get(['modoSilencioso', 'teclaSegurar', 'blacklist']).then(aplicarPreferencias);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.teclaSegurar) pararDeSegurar();
        aplicarPreferencias({
            modoSilencioso: changes.modoSilencioso ? changes.modoSilencioso.newValue : modoSilencioso,
            teclaSegurar: changes.teclaSegurar ? changes.teclaSegurar.newValue : teclaSegurar,
            blacklist: changes.blacklist ? changes.blacklist.newValue : blacklist
        });
    });

    function tocarSomAtendimento() {
        if (modoSilencioso) return;
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audio.volume = 1.0;
        audio.play().catch(() => {});
    }

    function elementoEstaVisivel(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' && 
               (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
    }

    // --- FUNÇÕES AUXILIARES PARA AUTOMAÇÃO AVANÇADA NO REACT/MUI ---
    function simularCliqueReact(elemento) {
        if (!elemento) return;
        
        if (typeof elemento.focus === 'function') {
            elemento.focus();
        }

        const propriedades = { bubbles: true, cancelable: true, view: window, buttons: 1 };
        elemento.dispatchEvent(new MouseEvent('mousedown', propriedades));
        elemento.dispatchEvent(new MouseEvent('mouseup', propriedades));
        elemento.dispatchEvent(new MouseEvent('click', propriedades));
    }

    function esperarElemento(seletor, timeout = 3000) {
        return new Promise(resolve => {
            const inicio = Date.now();
            const intervalo = setInterval(() => {
                const els = document.querySelectorAll(seletor);
                for (let el of els) {
                    if (elementoEstaVisivel(el)) {
                        clearInterval(intervalo);
                        return resolve(el);
                    }
                }
                if (Date.now() - inicio > timeout) {
                    clearInterval(intervalo);
                    resolve(null);
                }
            }, 100);
        });
    }
    // -------------------------------------------------------------

    function obterBotaoAtendimento() {
        const disponivel = btn => btn?.isConnected && !btn.disabled &&
            btn.getAttribute('aria-disabled') !== 'true' && elementoEstaVisivel(btn);
        if (disponivel(botaoAtendimentoCache) &&
            (botaoAtendimentoCache.matches('button[class*="green"]') ||
             botaoAtendimentoCache.querySelector('span[class*="bg-green"]'))) return botaoAtendimentoCache;
        botaoAtendimentoCache = null;
        for (const span of document.querySelectorAll('span.rounded-full.p-2.bg-green-500, span.bg-green-500, span[class*="bg-green"]')) {
            const btn = span.closest('button');
            if (disponivel(btn)) return (botaoAtendimentoCache = btn);
        }

        const botoesVerdes = document.querySelectorAll('button.bg-green-500, button[class*="bg-green"], button[class*="green"]');
        for (const btn of botoesVerdes) {
            if (disponivel(btn)) return (botaoAtendimentoCache = btn);
        }
        return null;
    }

    function existeAlvoDeAtendimentoNaTela() {
        return !!obterBotaoAtendimento();
    }

    function existeChamadaAtivaNaTela() {
        const botoesVermelhos = document.querySelectorAll('button.bg-red-500, button[class*="bg-red"], span.bg-red-500, [class*="red-500"]');
        for (const btn of botoesVermelhos) {
            if (elementoEstaVisivel(btn)) return true;
        }
        return false;
    }

    function dispararAtendimento() {
        if (!IS_NATIVE_TAB) return false;

        const botaoAlvo = obterBotaoAtendimento();
        if (!botaoAlvo) ultimoBotaoAtendido = null;

        if (botaoAlvo && botaoAlvo !== ultimoBotaoAtendido && atendimentoPermitido(botaoAlvo)) {
            ultimoBotaoAtendido = botaoAlvo;
            botaoAlvo.click();
            tocarSomAtendimento();
            chamadaAtiva = true;
            chamadaTocando = false;
            removerModalChamada();
            atualizarVisibilidadeControles();
            return true;
        }

        return false;
    }

    // --- FUNÇÃO PARA AUTOMATIZAR A PAUSA (CORRIGIDA) ---
    async function automatizarPausa(motivoDaPausa) {
        if (!IS_NATIVE_TAB) return;

        // 1. Procura o botão de pausa baseando-se no vetor SVG fornecido
        const paths = document.querySelectorAll('path');
        let btnPausa = null;
        for (let p of paths) {
            if (p.getAttribute('d') && p.getAttribute('d').includes('M144 479H48')) {
                btnPausa = p.closest('button') || p.parentElement;
                break;
            }
        }

        if (btnPausa) {
            btnPausa.click();
        }

        // 2. Aguarda o dropdown "Pausa" aparecer na tela e clica nele
        const dropdownPausa = await esperarElemento('#Pausa', 2500);
        if (!dropdownPausa) return; 
        
        simularCliqueReact(dropdownPausa);

        // 3. Dá um tempo extra (600ms) para a animação do menu do MUI abrir
        await new Promise(r => setTimeout(r, 600));

        // 4. Procura o texto exato na lista de opções e clica nele
        const opcoes = document.querySelectorAll('li[role="option"]');
        let opcaoEncontrada = null;
        for (let opcao of opcoes) {
            if (opcao.textContent.toLowerCase().includes(motivoDaPausa.toLowerCase())) {
                opcaoEncontrada = opcao;
                break;
            }
        }

        if (opcaoEncontrada) {
            simularCliqueReact(opcaoEncontrada);
        } else {
            return;
        }

        // 5. TEMPO CRÍTICO: Espera a "película" transparente do MUI Select sumir completamente.
        // Sem esse tempo (1 segundo), o próximo clique bate no fundo falso e fecha o modal.
        await new Promise(r => setTimeout(r, 1000));

        // 6. Procura exatamente o botão Confirmar que você enviou
        const btnConfirmar = document.querySelector('button[form="dynamic-form"]');
        
        if (btnConfirmar) {
            // Usa o clique nativo que não propaga eventos extras para o fundo do modal
            btnConfirmar.click();
            
            // Garantia extra: se o botão ainda estiver na tela após 300ms, clica de novo
            setTimeout(() => {
                if (elementoEstaVisivel(btnConfirmar)) {
                    btnConfirmar.click();
                }
            }, 300);
        }
    }

    // --- ÍCONES SVG VETORIAIS ---
    const SVG_PHONE_CALL = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
    const SVG_CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const SVG_MIC_ON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
    const SVG_MIC_MUTED = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
    const SVG_WAVE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v4"></path><path d="M6 6v12"></path><path d="M10 3v18"></path><path d="M14 8v8"></path><path d="M18 5v14"></path><path d="M22 10v4"></path></svg>`;
    const SVG_TOOLS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

    // --- MODAL DE CHAMADA RECEBIDA (COMPACTO) ---
    function criarModalChamada() {
        chamadaTocando = true;
        atualizarVisibilidadeControles();

        if (!configuracaoCarregada || modoSilencioso) return;

        if (document.getElementById('native-infinity-modal-host')) return;

        const host = document.createElement('div');
        host.id = 'native-infinity-modal-host';
        host.style.cssText = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            z-index: 2147483647 !important;
            width: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            background: transparent !important;
            pointer-events: auto !important;
            display: block !important;
        `;

        const shadow = host.attachShadow({ mode: 'open' });

        shadow.innerHTML = `
            <style>
                :host {
                    all: initial;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                }
                .modal-card {
                    background: rgba(15, 23, 42, 0.85);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    color: #ffffff;
                    padding: 10px 14px;
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 15px rgba(34, 197, 94, 0.1);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    box-sizing: border-box;
                    animation: modalEnter 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                    position: relative;
                    overflow: hidden;
                }
                .modal-card::before {
                    content: '';
                    position: absolute;
                    left: 0; top: 0; bottom: 0; width: 3px;
                    background: linear-gradient(180deg, #22c55e, #10b981);
                }
                .modal-card.closing {
                    animation: modalExit 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
                }
                .phone-icon-box {
                    width: 36px; height: 36px; border-radius: 8px;
                    background: rgba(34, 197, 94, 0.15);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #4ade80; display: flex; align-items: center; justify-content: center;
                    position: relative; flex-shrink: 0;
                    animation: phoneShake 1.5s infinite ease-in-out;
                }
                .phone-icon-box svg { width: 18px; height: 18px; }
                .phone-ripple {
                    position: absolute; inset: -4px; border-radius: 10px;
                    border: 1px solid rgba(34, 197, 94, 0.4);
                    animation: rippleExpand 1.6s infinite cubic-bezier(0, 0.2, 0.8, 1);
                }
                .phone-ripple-2 { animation-delay: 0.5s; }
                .info-block { display: flex; flex-direction: column; text-align: left; }
                .title-line { display: flex; align-items: center; gap: 6px; }
                .main-title { font-weight: 600; font-size: 13px; color: #f8fafc; margin: 0; }
                .call-badge {
                    display: inline-flex; align-items: center; gap: 4px;
                    background: rgba(34, 197, 94, 0.15); color: #4ade80;
                    border: 1px solid rgba(34, 197, 94, 0.25); font-size: 9px;
                    font-weight: 700; padding: 2px 6px; border-radius: 4px;
                    text-transform: uppercase; letter-spacing: 0.02em;
                }
                .pulse-dot {
                    width: 5px; height: 5px; border-radius: 50%;
                    background-color: #22c55e; box-shadow: 0 0 6px #22c55e;
                    animation: pulseGlow 0.8s infinite alternate;
                }
                .subtitle { font-size: 11px; color: #94a3b8; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
                .subtitle svg { width: 12px; height: 12px; }
                .btn-atender {
                    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
                    color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2);
                    padding: 8px 12px; border-radius: 8px; font-weight: 600;
                    cursor: pointer; font-size: 12px; margin-left: 4px;
                    display: flex; align-items: center; gap: 6px;
                    box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    outline: none; white-space: nowrap;
                }
                .btn-atender svg { width: 14px; height: 14px; }
                .btn-atender:hover {
                    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px rgba(34, 197, 94, 0.4);
                }
                .btn-atender:active { transform: translateY(1px); }
                .kbd-badge {
                    background: rgba(255, 255, 255, 0.2); padding: 1px 5px;
                    border-radius: 4px; font-size: 10px; font-weight: 700;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                @keyframes modalEnter {
                    0% { opacity: 0; transform: translateY(-20px) scale(0.95); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes modalExit {
                    0% { opacity: 1; transform: translateY(0) scale(1); }
                    100% { opacity: 0; transform: translateY(-10px) scale(0.95); }
                }
                @keyframes phoneShake {
                    0%, 100% { transform: rotate(0deg) scale(1); }
                    10%, 30%, 50% { transform: rotate(-8deg) scale(1.05); }
                    20%, 40% { transform: rotate(8deg) scale(1.05); }
                    60% { transform: rotate(0deg) scale(1); }
                }
                @keyframes rippleExpand {
                    0% { transform: scale(0.9); opacity: 0.8; }
                    100% { transform: scale(1.3); opacity: 0; }
                }
                @keyframes pulseGlow {
                    from { opacity: 0.3; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1.2); }
                }
            </style>
            <div class="modal-card" id="modal-card">
                <div class="phone-icon-box">
                    <div class="phone-ripple"></div>
                    <div class="phone-ripple phone-ripple-2"></div>
                    ${SVG_PHONE_CALL}
                </div>
                <div class="info-block">
                    <div class="title-line">
                        <span class="main-title">Chamada Recebida</span>
                        <span class="call-badge"><span class="pulse-dot"></span>Tocando</span>
                    </div>
                    <span class="subtitle">${SVG_WAVE} Native Infinity</span>
                </div>
                <button id="btn-atender" class="btn-atender">
                    ${SVG_CHECK}
                    Atender
                    <span class="kbd-badge">F4</span>
                </button>
            </div>
        `;

        const target = document.body || document.documentElement;
        if (target) target.appendChild(host);

        const btn = shadow.getElementById('btn-atender');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (IS_NATIVE_TAB) {
                    dispararAtendimento();
                } else {
                    chrome.runtime.sendMessage({ action: "atender_ligacao_pelo_modal" }).catch(() => {});
                }
                removerModalChamada();
            });
        }
    }

    function removerModalChamada() {
        chamadaTocando = false;
        atualizarVisibilidadeControles();

        const host = document.getElementById('native-infinity-modal-host');
        if (host) {
            const card = host.shadowRoot ? host.shadowRoot.getElementById('modal-card') : null;
            if (card) {
                card.classList.add('closing');
                setTimeout(() => {
                    if (host.parentNode) host.remove();
                }, 240);
            } else {
                host.remove();
            }
        }
    }

    // --- PAINEL UNIFICADO DE UTENSÍLIOS ---
    let controlesHost = null;

    function criarControlesIntegrados() {
        if (controlesHost && document.getElementById('native-infinity-tools-host')) return controlesHost;

        controlesHost = document.createElement('div');
        controlesHost.id = 'native-infinity-tools-host';
        
        const shadow = controlesHost.attachShadow({ mode: 'open' });

        shadow.innerHTML = `
            <style>
                :host {
                    all: initial;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }

                .tools-panel {
                    position: fixed;
                    bottom: 24px;
                    left: 24px;
                    z-index: 2147483647;
                    display: flex;
                    flex-direction: column;
                    width: 44px;
                    height: 44px;
                    border-radius: 22px;
                    
                    background: rgba(30, 41, 59, 0.85); 
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
                    opacity: 0.9;
                    
                    color: #ffffff;
                    transition: width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
                                height 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
                                opacity 0.3s ease,
                                background 0.3s ease,
                                border-radius 0.3s ease,
                                box-shadow 0.3s ease,
                                border-color 0.3s ease;
                    overflow: hidden;
                    box-sizing: border-box;
                    pointer-events: auto;
                }

                .tools-panel:hover, .tools-panel:focus-within {
                    opacity: 1;
                    background: rgba(15, 23, 42, 0.95);
                    border-color: rgba(255, 255, 255, 0.25);
                    width: 250px;
                    height: 740px;
                    max-height: calc(100vh - 48px);
                    overflow-y: auto;
                    border-radius: 16px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
                }

                .tools-panel.hide-mic:hover, .tools-panel.hide-mic:focus-within {
                    height: 702px;
                }

                .tools-header {
                    display: flex;
                    align-items: center;
                    width: 250px;
                    height: 44px;
                    flex-shrink: 0;
                    cursor: default;
                }

                .main-icon {
                    width: 44px; height: 44px;
                    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
                    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                    color: #ffffff;
                }

                .tools-panel:hover .main-icon {
                    transform: rotate(90deg);
                    color: #94a3b8;
                }

                .header-text {
                    font-size: 13px;
                    font-weight: 600;
                    color: #94a3b8;
                    opacity: 0;
                    transform: translateX(-10px);
                    transition: all 0.3s ease;
                }

                .tools-panel:hover .header-text, .tools-panel:focus-within .header-text {
                    opacity: 1;
                    transform: translateX(0);
                }

                .tools-content {
                    display: flex;
                    flex-direction: column;
                    padding: 0 8px 8px 8px;
                    gap: 4px;
                    opacity: 0;
                    transform: translateY(-5px);
                    transition: opacity 0.2s ease, transform 0.2s ease;
                    pointer-events: none; 
                }

                .tools-panel:hover .tools-content, .tools-panel:focus-within .tools-content {
                    opacity: 1;
                    transform: translateY(0);
                    pointer-events: auto;
                    transition-delay: 0.1s;
                }

                .tool-row {
                    display: flex;
                    align-items: center;
                    height: 34px;
                    padding: 0 8px;
                    gap: 8px;
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.03);
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 600;
                    color: #cbd5e1;
                    border: 1px solid transparent;
                    transition: all 0.2s ease;
                }

                .tool-row:hover {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                }

                .tool-row:active {
                    transform: scale(0.98);
                }

                button.tool-row { width: 100%; font-family: inherit; flex-shrink: 0; }
                .tool-row.active { background: rgba(34,197,94,.2); border-color: #22c55e; }
                .shortcut-label { font-size: 11px; color: #cbd5e1; display: flex; align-items: center; justify-content: space-between; }
                select { background: #1e293b; color: white; border: 1px solid #64748b; border-radius: 5px; padding: 4px; }
                .tools-note { font-size: 11px; line-height: 1.4; color: #94a3b8; margin: 2px 0; }
                #blacklist-numbers { box-sizing: border-box; width: 100%; min-height: 76px; resize: vertical; background: #1e293b; color: white; border: 1px solid #64748b; border-radius: 5px; padding: 6px; font: inherit; }
                #blacklist-saved { white-space: pre-line; max-height: 110px; overflow-y: auto; flex-shrink: 0; padding: 8px; border: 1px solid #475569; border-radius: 5px; background: #0f172a; color: #e2e8f0; font-size: 12px; line-height: 1.6; user-select: text; }
                .blacklist-item { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 3px 0; }
                .blacklist-item button { background: #334155; color: #fecaca; border: 1px solid #64748b; border-radius: 4px; cursor: pointer; padding: 4px; font: inherit; }
                #mic-row { display: none; }
                #mic-row.visible { display: flex; }

                .row-icon {
                    width: 18px; height: 18px;
                    display: flex; align-items: center; justify-content: center;
                }
                .row-icon svg { width: 15px; height: 15px; }

                .tool-row.active .row-icon { color: #4ade80; }
                .tool-row.muted .row-icon { color: #f87171; }
                .tool-row.active, .tool-row.muted { color: #f8fafc; }

                .kbd-hint {
                    margin-left: auto;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    color: #94a3b8;
                }

            </style>

            <div id="tools-panel" class="tools-panel hide-mic">
                <!-- Cabeçalho Principal -->
                <div class="tools-header">
                    <div class="main-icon">${SVG_TOOLS}</div>
                    <span class="header-text">Utensílios</span>
                </div>

                <!-- Painel Oculto -->
                <div class="tools-content">
                    <button id="hold-row" class="tool-row" aria-pressed="false">Segure para atender</button>
                    <label class="shortcut-label">Comando para segurar
                        <select id="hold-key"><option>Alt+Insert</option><option>Ctrl+Insert</option><option>Shift+Insert</option></select>
                    </label>
                    <p class="tools-note">Segure o comando ou o botão. Ao soltar, novos atendimentos param. Requer foco na página.</p>
                    <button id="silent-row" class="tool-row" aria-pressed="false">Modo Silencioso: desligado</button>
                    <p class="tools-note">Silencia o áudio do Native Infinity e oculta os avisos da extensão.</p>
                    <button id="shortcut-row" class="tool-row">Escolher atalho do Modo Silencioso</button>
                    <label class="shortcut-label" for="blacklist-numbers">Black List — adicionar números</label>
                    <textarea id="blacklist-numbers" placeholder="Um número com DDD por linha" spellcheck="false"></textarea>
                    <button id="blacklist-save" type="button" class="tool-row">Adicionar à Black List</button>
                    <p class="tools-note">Adicione um ou vários telefones com DDD. Os números já salvos são mantidos. Para desbloquear, clique em Remover.</p>
                    <p id="blacklist-status" class="tools-note" role="status" aria-live="polite"></p>
                    <span id="blacklist-saved-title" class="shortcut-label">Números salvos (0)</span>
                    <div id="blacklist-saved" role="region" aria-labelledby="blacklist-saved-title" tabindex="0">Nenhum número bloqueado.</div>
                    <div id="mic-row" class="tool-row active">
                        <div id="mic-icon" class="row-icon">${SVG_MIC_ON}</div>
                        <span id="mic-label">Microfone ativo</span>
                        <span class="kbd-hint">F8</span>
                    </div>
                </div>
            </div>
        `;

        const target = document.body || document.documentElement;
        if (target) target.appendChild(controlesHost);

        const blacklistEditor = shadow.getElementById('blacklist-numbers');
        blacklistEditor.value = '';
        atualizarListaBlacklist();
        blacklistEditor.addEventListener('input', () => { blacklistEmEdicao = true; });
        shadow.getElementById('blacklist-save').addEventListener('click', async () => {
            const status = shadow.getElementById('blacklist-status');
            let numeros;
            try {
                numeros = lerNumerosBlacklist(blacklistEditor.value);
            } catch (erro) {
                status.textContent = erro.message;
                return;
            }
            if (!numeros.length) {
                status.textContent = 'Digite pelo menos um telefone para adicionar.';
                return;
            }
            const textoSalvo = blacklistEditor.value;
            try {
                const salvos = await chrome.storage.local.get('blacklist');
                numeros = [...new Set([...(salvos.blacklist || []).map(normalizarTelefone), ...numeros])];
                await chrome.storage.local.set({ blacklist: numeros });
                blacklist = numeros;
                if (blacklistEditor.value === textoSalvo) {
                    blacklistEmEdicao = false;
                    blacklistEditor.value = '';
                }
                atualizarListaBlacklist();
                status.textContent = `Black List salva: ${numeros.length} número(s).`;
            } catch {
                status.textContent = 'Não foi possível salvar. Tente novamente.';
            }
        });

        shadow.getElementById('silent-row').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'alternar_modo_silencioso' }).catch(() => {});
        });
        shadow.getElementById('shortcut-row').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'configurar_atalhos' }).catch(() => {});
        });
        shadow.getElementById('hold-key').addEventListener('change', (event) => {
            pararDeSegurar();
            teclaSegurar = event.target.value;
            chrome.storage.local.set({ teclaSegurar });
        });
        const holdRow = shadow.getElementById('hold-row');
        holdRow.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            holdRow.setPointerCapture(event.pointerId);
            iniciarSegurar();
        });
        for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) holdRow.addEventListener(tipo, pararDeSegurar);
        holdRow.addEventListener('keydown', event => {
            if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); iniciarSegurar(); }
        });
        holdRow.addEventListener('keyup', event => {
            if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); pararDeSegurar(); }
        });
        holdRow.addEventListener('blur', pararDeSegurar);
        atualizarUtilidades();
        const micRow = shadow.getElementById('mic-row');
        if (micRow) {
            micRow.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                window.dispatchEvent(new CustomEvent('nativeInfinityAlternarMic'));
            });
        }

        return controlesHost;
    }

    function atualizarIndicadorMic(mutado, semTrackAtiva) {
        if (!IS_NATIVE_TAB) return;
        micEstadoAtual = { mutado, tracks: semTrackAtiva ? 0 : 1 };
        
        const host = criarControlesIntegrados();
        const shadow = host ? host.shadowRoot : null;
        if (!shadow) return;

        const row = shadow.getElementById('mic-row');
        const iconSpan = shadow.getElementById('mic-icon');
        const labelSpan = shadow.getElementById('mic-label');

        if (!row || !iconSpan || !labelSpan) return;

        if (mutado) {
            row.classList.remove('active');
            row.classList.add('muted');
            iconSpan.innerHTML = SVG_MIC_MUTED;
            labelSpan.textContent = 'Microfone mudo';
        } else {
            row.classList.remove('muted');
            row.classList.add('active');
            iconSpan.innerHTML = SVG_MIC_ON;
            labelSpan.textContent = 'Microfone ativo';
        }

        atualizarVisibilidadeControles();
    }

    function atualizarVisibilidadeControles() {
        if (!IS_NATIVE_TAB) return;
        const host = criarControlesIntegrados();
        const shadow = host ? host.shadowRoot : null;
        
        if (shadow) {
            const panel = shadow.getElementById('tools-panel');
            const micRow = shadow.getElementById('mic-row');
            const emChamadaAtiva = (chamadaAtiva || existeChamadaAtivaNaTela() || micEstadoAtual.tracks > 0) && !chamadaTocando;

            if (panel && micRow) {
                if (emChamadaAtiva) {
                    micRow.classList.add('visible');
                    panel.classList.remove('hide-mic');
                } else {
                    micRow.classList.remove('visible');
                    panel.classList.add('hide-mic');
                }
            }
        }
    }

    // --- TECLADO LOCAL ---
    function comandoSegurarCorresponde(event) {
        const [modificador, tecla] = teclaSegurar.split('+');
        return event.key === tecla &&
            !!event.altKey === (modificador === 'Alt') &&
            !!event.ctrlKey === (modificador === 'Ctrl') &&
            !!event.shiftKey === (modificador === 'Shift') && !event.metaKey;
    }

    const capturarTecladoLocal = (event) => {
        if (comandoSegurarCorresponde(event)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            iniciarSegurar();
        } else if (event.key === 'F4') {
            event.preventDefault();
            event.stopPropagation(); 
            if (IS_NATIVE_TAB) {
                dispararAtendimento();
            } else {
                chrome.runtime.sendMessage({ action: "atender_ligacao_pelo_modal" }).catch(() => {});
            }
            removerModalChamada();
        } else if (event.key === 'End') {
            event.preventDefault();
            event.stopPropagation();
            automatizarPausa('Banheiro');
        } else if (event.key === 'Home') {
            event.preventDefault();
            event.stopPropagation();
            automatizarPausa('Banheiro'); // Se quiser mudar para outro motivo no Home, altere aqui.
        }
    };

    window.addEventListener('keydown', capturarTecladoLocal, true);
    window.addEventListener('keyup', event => {
        const [modificador, tecla] = teclaSegurar.split('+');
        if (event.key === tecla || event.key === (modificador === 'Ctrl' ? 'Control' : modificador)) pararDeSegurar();
    }, true);
    window.addEventListener('blur', pararDeSegurar);
    window.addEventListener('pagehide', pararDeSegurar);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pararDeSegurar();
    });

    // --- MENSAGENS DA EXTENSÃO ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "executar_clique_f4") {
            sendResponse({ atendido: dispararAtendimento() });
        } else if (request.action === "exibir_modal_chamada") {
            criarModalChamada();
        } else if (request.action === "remover_modal_chamada") {
            removerModalChamada();
        } else if (request.action === "alternar_mudo_microfone" && IS_NATIVE_TAB) {
            window.dispatchEvent(new CustomEvent('nativeInfinityAlternarMic'));
        }
    });

    // --- DETECÇÃO AUTOMÁTICA NA ABA DO NATIVE INFINITY ---
    if (IS_NATIVE_TAB) {
        function verificarESinalizarLigacaoTocando() {
            const presenteAgora = existeAlvoDeAtendimentoNaTela();
            const emChamadaAgora = existeChamadaAtivaNaTela();
            if (!presenteAgora) ultimoBotaoAtendido = null;

            if (presenteAgora && !alvoJaEstavaPresente) {
                chamadaTocando = true;
                chamadaAtiva = false;
                criarModalChamada();
                chrome.runtime.sendMessage({ action: "notificar_ligacao_tocando" }).catch(() => {});
            } else if (!presenteAgora && alvoJaEstavaPresente) {
                chamadaTocando = false;
                removerModalChamada();
                chrome.runtime.sendMessage({ action: "notificar_ligacao_encerrada" }).catch(() => {});
            }

            if (emChamadaAgora) {
                chamadaAtiva = true;
            } else if (!presenteAgora && !emChamadaAgora && micEstadoAtual.tracks === 0) {
                chamadaAtiva = false;
            }

            alvoJaEstavaPresente = presenteAgora;
            atualizarVisibilidadeControles();
        }

        const observer = new MutationObserver(() => {
            botaoAtendimentoCache = null;
            verificarESinalizarLigacaoTocando();
        });

        function iniciarObservador() {
            if (document.body) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled']
                });
            }
            verificarESinalizarLigacaoTocando();
            // Mutações são detectadas imediatamente; o timer cobre apenas mudanças de CSS.
            setInterval(verificarESinalizarLigacaoTocando, 500);
        }

        if (document.body) {
            iniciarObservador();
        } else {
            document.addEventListener('DOMContentLoaded', iniciarObservador);
        }

        window.addEventListener('nativeInfinityMicEstado', (evento) => {
            try {
                const estado = JSON.parse(evento.detail);
                atualizarIndicadorMic(estado.mutado, estado.tracks === 0);
                chrome.runtime.sendMessage({ action: "mudo_estado_atualizado", mutado: estado.mutado }).catch(() => {});
            } catch (e) {}
        });

        const capturarTecladoMic = (event) => {
            if (event.key === 'F8') {
                event.preventDefault();
                event.stopPropagation();
                window.dispatchEvent(new CustomEvent('nativeInfinityAlternarMic'));
            }
        };
        window.addEventListener('keydown', capturarTecladoMic, true);


        function iniciarIndicadores() {
            criarControlesIntegrados();
            window.dispatchEvent(new CustomEvent('nativeInfinityConsultarMic'));
        }

        if (document.body) {
            iniciarIndicadores();
        } else {
            document.addEventListener('DOMContentLoaded', iniciarIndicadores);
        }
    }
})();
