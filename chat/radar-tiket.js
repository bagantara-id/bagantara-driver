// ==========================================================================
// FILE: chat/radar-tiket.js
// FUNGSI: Mesin Radar & Auto-Routing ke Inbox (Tanpa Pop-up)
// ARSITEKTUR: Background Microservice & Zero-Latency Routing
// ==========================================================================

import { dbChat } from './config-chat.js';
import { ref, onChildAdded, remove, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

let referensiRadar = null;
let uidDriverAktif = null;
let pemantauRadar = null; // KOREKSI: Variabel untuk menyimpan State Listener agar bisa dibunuh

// =======================================================================
// ⚙️ KONFIGURASI NADA DERING (SILAKAN ISI LINK CLOUDINARY ANDA)
// =======================================================================
const RINGTONE_RADAR = "MASUKKAN_LINK_AUDIO_CLOUDINARY_ANDA_DISINI.mp3"; 

// Engine Audio Sonar (Alarm Order Masuk) - DENGAN AUDIO LOCK 20 DETIK
let isAudioPlaying = false;
function bunyikanSonarTiket() {
    if (isAudioPlaying) return;
    
    try {
        if(RINGTONE_RADAR && RINGTONE_RADAR.startsWith("http")) {
            const audio = new Audio(RINGTONE_RADAR);
            isAudioPlaying = true;
            
            audio.play().catch(e => {
                console.warn("Auto-play audio diblokir peramban");
                isAudioPlaying = false; 
            });

            // Kunci tertutup selama 20 detik (mencegah tabrakan audio jika ada order beruntun)
            setTimeout(() => {
                isAudioPlaying = false;
            }, 20000);
        }
    } catch (e) {
        isAudioPlaying = false;
    }
}

export function hidupkanRadar(uid) {
    if (!uid) return;
    uidDriverAktif = uid;
    
    referensiRadar = ref(dbChat, `radar_tiket/${uid}`);
    
    // KOREKSI: Cabut pendengar (listener) lama jika tombol On/Off ditekan berkali-kali
    if (pemantauRadar) { 
        pemantauRadar(); 
        pemantauRadar = null; 
    }
    
    // Memantau secara konstan aliran data tiket masuk dari Klien
    pemantauRadar = onChildAdded(referensiRadar, async (snapshot) => {
        const tiket = snapshot.val();
        const idTiket = snapshot.key; 
        
        // KOREKSI FATAL GHOST ORDER: Buang tiket otomatis dari KETIGA node jika > 5 menit
        if (Date.now() - tiket.waktu_dibuat > 300000) {
            remove(ref(dbChat, `radar_tiket/${uidDriverAktif}/${idTiket}`));
            remove(ref(dbChat, `inbox_mitra/${uidDriverAktif}/${idTiket}`));
            remove(ref(dbChat, `sesi_komunikasi/${idTiket}`));
            return;
        }

        // INJEKSI SOLUSI ARSITEKTUR: Driver (auth != null) mencetak entri ke Inbox-nya sendiri.
        // Data ini diambil langsung dari payload tiket yang sudah masuk ke radar.
        try {
            await update(ref(dbChat, `inbox_mitra/${uidDriverAktif}/${idTiket}`), {
                nama_klien: tiket.nama_klien || "Penumpang",
                layanan: tiket.layanan || "ORDER",
                pesan_terakhir: "Katalog pesanan masuk...",
                waktu_dibuat: tiket.waktu_dibuat || Date.now(),
                waktu_update: Date.now()
            });
        } catch (err) { console.error("Gagal sinkronisasi Inbox internal:", err); }

        // 1. Peringatan Audio & Visual Halus (Tanpa memblokir layar)
        bunyikanSonarTiket();
        const indikatorKedip = document.getElementById('chat-notif-dot');
        if (indikatorKedip) indikatorKedip.classList.remove('hidden-state');

        // 2. TIKET MENGENDAP (MENUNGGU RESPON MANUAL DRIVER)
        try {
            // Tiket dibiarkan tetap berada di radar_tiket dengan status awal (WAITING).
            // Auto-Accept mutlak dihapus agar Driver memiliki kendali Terima/Tolak.
            
            // Tampilkan informasi visual di layar
            if(window.showToast) window.showToast("Pesanan Baru Masuk ke Kotak Pesan!", "success");
            
        } catch (err) {
            console.error("[RADAR ENGINE] Gagal memproses notifikasi tiket:", err);
        }
    });
}

export function matikanRadar() {
    // KOREKSI: Cabut paksa listener dari memori saat radar dimatikan agar terhindar dari Memory Leak
    if (pemantauRadar) {
        pemantauRadar();
        pemantauRadar = null;
    }
    
    // Memutuskan koneksi radar saat Driver offline/mangkal dihentikan
    uidDriverAktif = null;
}
