(function() {
    'use strict';

    if (window.__nativeInfinityMicHookInstalado) return;
    window.__nativeInfinityMicHookInstalado = true;

    const tracksControladas = new Set();
    let microfoneMutado = false;

    function notificarEstado() {
        window.dispatchEvent(new CustomEvent('nativeInfinityMicEstado', {
            detail: JSON.stringify({
                mutado: microfoneMutado,
                tracks: tracksControladas.size
            })
        }));
    }

    function aplicarEstadoATodasAsTracks() {
        tracksControladas.forEach((track) => {
            try {
                track.enabled = !microfoneMutado;
            } catch (erro) {
                console.log("Não foi possível alterar a track de áudio:", erro);
            }
        });
        notificarEstado();
    }

    function monitorarStream(stream) {
        stream.getAudioTracks().forEach((track) => {
            if (tracksControladas.has(track)) return;
            tracksControladas.add(track);
            track.enabled = !microfoneMutado;
            track.addEventListener('ended', () => {
                tracksControladas.delete(track);
                notificarEstado();
            });
        });
        notificarEstado();
    }

    try {
        const getUserMediaOriginal = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function(constraints) {
            return getUserMediaOriginal(constraints).then((stream) => {
                if (constraints && constraints.audio) {
                    monitorarStream(stream);
                }
                return stream;
            });
        };
    } catch (erro) {
        console.log("Não foi possível instalar o hook de microfone:", erro);
    }

    window.addEventListener('nativeInfinityAlternarMic', () => {
        microfoneMutado = !microfoneMutado;
        aplicarEstadoATodasAsTracks();
    });

    window.addEventListener('nativeInfinityConsultarMic', () => {
        notificarEstado();
    });
})();