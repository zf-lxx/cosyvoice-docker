'use strict';

let currentMode = 'zero_shot';
let promptFile = null;       // Step 1 音色上传文件
let rawFile = null;          // Step 0 原始音频文件
let processedBlob = null;    // Step 0 处理后的音频 blob
let startTime = 0;
let waveSurfer = null;       // WaveSurfer 实例
let wsRegions = null;        // RegionsPlugin 实例
let activeRegion = null;     // 当前选区

// ── Toast ─────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon  = document.getElementById('toast-icon');
    const msg   = document.getElementById('toast-message');
    const icons = {
        success: 'fa-check-circle text-green-500',
        error:   'fa-times-circle text-red-500',
        info:    'fa-info-circle text-blue-500'
    };
    icon.className = `fas ${icons[type] || icons.success} text-sm`;
    msg.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ── 合成模式 Tab ──────────────────────────────────────
const modeDescs = {
    zero_shot:    '使用保存的音色，将文本合成为相同声线的语音',
    cross_lingual:'保持音色特征，合成其他语种的语音（如中文音色说英文）',
    instruct:     '通过指令控制方言、情感等（如：用四川话说、带开心的情绪）'
};

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('bg-white', 'text-gray-800', 'border', 'border-gray-200');
            t.classList.add('text-gray-500');
        });
        tab.classList.add('bg-white', 'text-gray-800', 'border', 'border-gray-200');
        tab.classList.remove('text-gray-500');
        currentMode = tab.dataset.mode;
        document.getElementById('mode-desc').textContent = modeDescs[currentMode];
        document.getElementById('instruct-group').classList.toggle('hidden', currentMode !== 'instruct');
    });
});

// ── Step 0: 原始音频上传 ──────────────────────────────
const rawUploadArea = document.getElementById('raw-upload-area');
const rawFileInput  = document.getElementById('raw-file');

rawUploadArea.addEventListener('click', () => rawFileInput.click());
rawFileInput.addEventListener('change', e => loadRawFile(e.target.files[0]));
rawUploadArea.addEventListener('dragover', e => { e.preventDefault(); rawUploadArea.classList.add('border-gray-400', 'bg-gray-50'); });
rawUploadArea.addEventListener('dragleave', () => rawUploadArea.classList.remove('border-gray-400', 'bg-gray-50'));
rawUploadArea.addEventListener('drop', e => {
    e.preventDefault();
    rawUploadArea.classList.remove('border-gray-400', 'bg-gray-50');
    loadRawFile(e.dataTransfer.files[0]);
});

async function loadRawFile(file) {
    if (!file) return;
    rawFile = file;
    processedBlob = null;
    activeRegion = null;
    segments = [];
    document.getElementById('raw-file-name').textContent = file.name;
    document.getElementById('processed-preview').classList.add('hidden');
    document.getElementById('separate-section').classList.remove('hidden');
    document.getElementById('separate-compare').classList.add('hidden');
    loadWaveform(file, '原始音频');
}

function loadWaveform(fileOrBlob, sourceLabel) {
    const url = fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)
        ? URL.createObjectURL(fileOrBlob)
        : URL.createObjectURL(fileOrBlob);

    document.getElementById('trim-source-hint').textContent = sourceLabel;
    document.getElementById('raw-preview').classList.remove('hidden');
    document.getElementById('processed-preview').classList.add('hidden');
    segments = [];
    renderSegments();

    // 销毁旧实例
    if (waveSurfer) { waveSurfer.destroy(); waveSurfer = null; }

    wsRegions = WaveSurfer.Regions.create();
    waveSurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#9ca3af',
        progressColor: '#374151',
        cursorColor: '#6b7280',
        cursorWidth: 1,
        height: 80,
        normalize: true,
        plugins: [wsRegions],
    });
    waveSurfer.load(url);
    waveSurfer.on('ready', () => {
        const d = waveSurfer.getDuration();
        document.getElementById('raw-duration').textContent = `（${d.toFixed(1)} 秒）`;
        document.getElementById('trim-start').value = '0';
        document.getElementById('trim-end').value = d.toFixed(2);
        createRegion(0, d);
    });
    waveSurfer.on('play', () => {
        document.getElementById('play-icon').className = 'fas fa-pause text-xs';
    });
    waveSurfer.on('pause', () => {
        document.getElementById('play-icon').className = 'fas fa-play text-xs';
    });
    wsRegions.enableDragSelection({ color: 'rgba(55,65,81,0.15)' });
    wsRegions.on('region-created', region => {
        wsRegions.getRegions().forEach(r => { if (r.id !== region.id) r.remove(); });
        activeRegion = region;
        updateInputsFromRegion(region);
    });
    wsRegions.on('region-updated', region => {
        activeRegion = region;
        updateInputsFromRegion(region);
    });
}

function updateInputsFromRegion(region) {
    document.getElementById('trim-start').value = region.start.toFixed(2);
    document.getElementById('trim-end').value = region.end.toFixed(2);
}

function updateRegionFromInputs() {
    if (!activeRegion) return;
    const start = parseFloat(document.getElementById('trim-start').value) || 0;
    const end   = parseFloat(document.getElementById('trim-end').value) || 0;
    if (end > start) activeRegion.setOptions({ start, end });
}

function createRegion(start, end) {
    wsRegions.getRegions().forEach(r => r.remove());
    activeRegion = wsRegions.addRegion({
        start, end,
        color: 'rgba(55,65,81,0.15)',
        drag: true,
        resize: true,
    });
    updateInputsFromRegion(activeRegion);
}

function clearRegion() {
    wsRegions.getRegions().forEach(r => r.remove());
    activeRegion = null;
    const d = waveSurfer ? waveSurfer.getDuration() : 0;
    document.getElementById('trim-start').value = '0';
    document.getElementById('trim-end').value = d.toFixed(2);
}

// ── Step 0: 多段片段管理 ────────────────────────────
let segments = []; // [{start, end, duration}]

async function addSegment() {
    const start = parseFloat(document.getElementById('trim-start').value) || 0;
    const end   = parseFloat(document.getElementById('trim-end').value) || 0;
    if (end <= start) return showToast('结束时间必须大于开始时间', 'info');
    const duration = end - start;
    segments.push({ start, end, duration });
    renderSegments();
    showToast(`已添加片段 ${segments.length}（${duration.toFixed(1)} 秒）`, 'success');
}

function renderSegments() {
    const list = document.getElementById('segments-list');
    const items = document.getElementById('segments-items');
    const total = segments.reduce((a, s) => a + s.duration, 0);
    document.getElementById('segments-total').textContent =
        `${segments.length} 段，共 ${total.toFixed(1)} 秒` +
        (total > 30 ? ' ⚠️ 超过 30s' : '');
    items.innerHTML = segments.map((s, i) => `
        <div class="flex items-center justify-between px-2 py-1.5 bg-gray-50 border border-gray-100 rounded text-xs">
            <span class="text-gray-600">片段 ${i+1}：${s.start.toFixed(2)}s — ${s.end.toFixed(2)}s（${s.duration.toFixed(1)}s）</span>
            <button onclick="removeSegment(${i})" class="text-gray-400 hover:text-red-500 transition ml-2">
                <i class="fas fa-times"></i>
            </button>
        </div>`).join('');
    list.classList.toggle('hidden', segments.length === 0);
}

function removeSegment(i) {
    segments.splice(i, 1);
    renderSegments();
}

function clearSegments() {
    segments = [];
    renderSegments();
}

async function mergeSegments() {
    if (segments.length === 0) return showToast('请先添加片段', 'info');
    if (!rawFile) return showToast('请先上传音频', 'info');

    const btn = document.getElementById('merge-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>拼接中...';
    showProcessStatus('正在拼接片段...');

    try {
        const arrayBuffer = await rawFile.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        const sr = decoded.sampleRate;
        const ch = decoded.numberOfChannels;

        // 计算总采样数
        const totalSamples = segments.reduce((a, s) => {
            return a + Math.floor((s.end - s.start) * sr);
        }, 0);

        const merged = audioCtx.createBuffer(ch, totalSamples, sr);
        let offset = 0;
        for (const seg of segments) {
            const s = Math.floor(seg.start * sr);
            const e = Math.min(Math.floor(seg.end * sr), decoded.length);
            const len = e - s;
            for (let c = 0; c < ch; c++) {
                merged.copyToChannel(decoded.getChannelData(c).slice(s, e), c, offset);
            }
            offset += len;
        }
        audioCtx.close();

        processedBlob = audioBufferToWavBlob(merged);
        showProcessedPreview(processedBlob);
        const total = segments.reduce((a, s) => a + s.duration, 0);
        showToast(`拼接完成，共 ${total.toFixed(1)} 秒`, 'success');
    } catch (e) {
        showToast('拼接失败：' + e.message, 'error');
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-layer-group mr-1"></i>拼接片段';
        hideProcessStatus();
    }
}

// ── Step 0: 单段裁剪（保留，用于单段快速使用）────────
async function doTrim() {
    if (!rawFile) return showToast('请先上传音频', 'info');
    const start = parseFloat(document.getElementById('trim-start').value) || 0;
    const end   = parseFloat(document.getElementById('trim-end').value) || 0;
    if (end <= start) return showToast('结束时间必须大于开始时间', 'info');

    const btn = document.getElementById('trim-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>裁剪中...';
    showProcessStatus('正在裁剪...');

    try {
        const arrayBuffer = await rawFile.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);

        const sampleRate = decoded.sampleRate;
        const channels   = decoded.numberOfChannels;
        const startSample = Math.floor(start * sampleRate);
        const endSample   = Math.min(Math.floor(end * sampleRate), decoded.length);
        const length      = endSample - startSample;

        const trimmed = audioCtx.createBuffer(channels, length, sampleRate);
        for (let c = 0; c < channels; c++) {
            trimmed.copyToChannel(decoded.getChannelData(c).slice(startSample, endSample), c);
        }
        audioCtx.close();

        processedBlob = audioBufferToWavBlob(trimmed);
        showProcessedPreview(processedBlob);
        showToast(`裁剪完成（${(length / sampleRate).toFixed(1)} 秒）`, 'success');
    } catch (e) {
        showToast('裁剪失败：' + e.message, 'error');
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cut mr-1"></i>裁剪选区';
        hideProcessStatus();
    }
}

// AudioBuffer → WAV Blob
function audioBufferToWavBlob(buffer) {
    const numCh  = buffer.numberOfChannels;
    const sr     = buffer.sampleRate;
    const len    = buffer.length;
    const data   = new Float32Array(len * numCh);
    // 混合多声道为单声道
    for (let i = 0; i < len; i++) {
        let sum = 0;
        for (let c = 0; c < numCh; c++) sum += buffer.getChannelData(c)[i];
        data[i] = sum / numCh;
    }
    const pcm = new Int16Array(len);
    for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, data[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Blob([createWavHeader(len, sr, 1), pcm.buffer], { type: 'audio/wav' });
}

function createWavHeader(numSamples, sampleRate, numChannels) {
    const buf  = new ArrayBuffer(44);
    const view = new DataView(buf);
    const ws   = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    const byteRate = sampleRate * numChannels * 2;
    ws(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true);
    ws(8, 'WAVE'); ws(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true); view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true); ws(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    return buf;
}

// ── Step 0: 人声分离 ─────────────────────────────────
let separatedBlob = null; // 人声分离结果（独立存储，不污染 processedBlob）

async function doSeparate() {
    if (!rawFile) return showToast('请先上传音频', 'info');

    const btn     = document.getElementById('separate-btn');
    const btnText = document.getElementById('separate-btn-text');
    btn.disabled = true;
    btnText.textContent = '分离中...';
    showProcessStatus('正在提取人声，约需 1~3 分钟...');

    try {
        const fd = new FormData();
        fd.append('audio', rawFile);
        const res = await fetch('/api/audio/separate', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(await res.text());
        separatedBlob = await res.blob();

        // 显示对比预览
        const rawUrl = URL.createObjectURL(rawFile);
        const sepUrl = URL.createObjectURL(separatedBlob);
        const rawPreviewEl = document.getElementById('raw-audio-preview');
        rawPreviewEl.src = rawUrl;
        rawPreviewEl.load();
        const sepEl = document.getElementById('processed-audio');
        sepEl.src = sepUrl;
        sepEl.load();
        document.getElementById('separate-compare').classList.remove('hidden');
        showToast('人声提取完成，请对比后选择', 'success');
    } catch (e) {
        showToast('人声分离失败：' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = '重新提取';
        hideProcessStatus();
    }
}

// 使用人声分离结果继续裁剪
function useSeparated() {
    if (!separatedBlob) return;
    processedBlob = separatedBlob;
    loadWaveform(separatedBlob, '人声音频');
    showToast('已切换到人声音频，请裁剪', 'success');
}

// 忽略分离结果，用原音频裁剪
function useOriginalForTrim() {
    processedBlob = null;
    loadWaveform(rawFile, '原始音频');
    showToast('已切换到原始音频，请裁剪', 'info');
}

function showProcessedPreview(blob) {
    const url = URL.createObjectURL(new Blob([blob], { type: 'audio/wav' }));
    const audio = document.getElementById('trim-result-audio');
    audio.src = url;
    audio.load();
    document.getElementById('processed-preview').classList.remove('hidden');
}

function showProcessStatus(text) {
    document.getElementById('process-status-text').textContent = text;
    document.getElementById('process-status').classList.remove('hidden');
}

function hideProcessStatus() {
    document.getElementById('process-status').classList.add('hidden');
}

// 将处理结果填入 Step 1 上传区
function useProcessed() {
    if (!processedBlob) return;
    const name = (rawFile ? rawFile.name.replace(/\.[^.]+$/, '') : 'processed') + '_processed.wav';
    const file = new File([processedBlob], name, { type: 'audio/wav' });
    setPromptFile(file);
    document.getElementById('voice-name').value = name.replace('_processed.wav', '');
    showToast('已填入第 1 步，请填写音色名称后保存', 'info');
    // 滚动到 Step 1
    document.getElementById('upload-area').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Step 1: 上传区 ────────────────────────────────────
const uploadArea = document.getElementById('upload-area');
const fileInput  = document.getElementById('prompt-file');

uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => setPromptFile(e.target.files[0]));
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('border-gray-400', 'bg-gray-50'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('border-gray-400', 'bg-gray-50'));
uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('border-gray-400', 'bg-gray-50');
    setPromptFile(e.dataTransfer.files[0]);
});

function setPromptFile(file) {
    promptFile = file;
    document.getElementById('file-name').textContent = file ? file.name : '';
    if (file) {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        // 显示预览播放器
        const url = URL.createObjectURL(file);
        const audio = document.getElementById('prompt-audio');
        audio.src = url;
        audio.onloadedmetadata = () => {
            document.getElementById('prompt-duration').textContent =
                `（${audio.duration.toFixed(1)} 秒）`;
        };
        document.getElementById('prompt-preview').classList.remove('hidden');
    } else {
        document.getElementById('prompt-preview').classList.add('hidden');
    }
}

// ── Step 1: 创建音色 ──────────────────────────────────
async function createVoice() {
    if (!promptFile) return showCreateResult('error', '请先上传参考音频');
    const name = document.getElementById('voice-name').value.trim();
    if (!name) return showCreateResult('error', '请填写音色名称');
    const promptTextVal = document.getElementById('prompt-text').value.trim();
    if (!promptTextVal) return showCreateResult('error', '请填写参考文本（音频对应的文字内容）');

    const btn     = document.getElementById('create-btn');
    const btnText = document.getElementById('create-btn-text');
    btn.disabled = true;
    btnText.textContent = '正在提取音色特征...';

    try {
        const fd = new FormData();
        fd.append('audio', promptFile);
        fd.append('name', name);
        const text = document.getElementById('prompt-text').value.trim();
        if (text) fd.append('text', text);

        const res  = await fetch('/v1/voices/create', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || res.statusText);

        showCreateResult('success',
            `音色「${data.name}」创建成功` +
            (data.text ? `，识别文本：${data.text}` : '')
        );
        promptFile = null;
        fileInput.value = '';
        document.getElementById('file-name').textContent = '';
        document.getElementById('voice-name').value = '';
        document.getElementById('prompt-text').value = '';
        await refreshVoices(data.voice_id);
        showToast('音色创建成功', 'success');
    } catch (e) {
        showCreateResult('error', '创建失败：' + e.message);
        showToast('创建失败', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = '提取并保存音色';
    }
}

function showCreateResult(type, msg) {
    const el = document.getElementById('create-result');
    if (!type) { el.classList.add('hidden'); return; }
    el.className = type === 'success'
        ? 'px-3 py-2.5 rounded-md text-sm bg-green-50 text-green-700 border border-green-100'
        : 'px-3 py-2.5 rounded-md text-sm bg-red-50 text-red-600 border border-red-100';
    el.textContent = msg;
    el.classList.remove('hidden');
}

// ── Step 2: 音色列表 ──────────────────────────────────
async function refreshVoices(selectId = null) {
    try {
        const res  = await fetch('/v1/voices/custom');
        const data = await res.json();
        const sel  = document.getElementById('voice-select');
        if (data.voices.length === 0) {
            sel.innerHTML = '<option value="">-- 请先在第 1 步创建音色 --</option>';
        } else {
            sel.innerHTML = '<option value="">-- 请选择音色 --</option>';
            data.voices.forEach(v => {
                sel.innerHTML += `<option value="${v.id}">${v.name}</option>`;
            });
        }
        if (selectId) sel.value = selectId;
    } catch (e) { console.error(e); }
}

async function deleteSelectedVoice() {
    const id = document.getElementById('voice-select').value;
    if (!id) return showToast('请先选择要删除的音色', 'info');
    if (!confirm('确定删除此音色？删除后无法恢复。')) return;
    await fetch(`/v1/voices/${id}`, { method: 'DELETE' });
    await refreshVoices();
    showToast('音色已删除', 'info');
}

// ── Step 2: 生成语音 ──────────────────────────────────
async function generate() {
    const text    = document.getElementById('text').value.trim();
    const voiceId = document.getElementById('voice-select').value;
    const stream  = true; // 始终使用流式传输
    const speed   = parseFloat(document.getElementById('speed').value) || 1.0;

    if (!text)    return showToast('请输入要合成的文本', 'info');
    if (!voiceId) return showToast('请先选择音色', 'info');

    const btn     = document.getElementById('generate-btn');
    const btnText = document.getElementById('btn-text');
    btn.disabled = true;
    btnText.textContent = '生成中...';

    const resultArea = document.getElementById('result-area');
    resultArea.classList.remove('hidden');
    document.getElementById('audio-wrap').classList.add('hidden');
    document.getElementById('seed-display').classList.add('hidden');
    document.getElementById('progress').style.width = '0%';
    document.getElementById('progress-pct').textContent = '0%';
    document.getElementById('progress-status').textContent = '正在生成...';
    ['ttfb', 'start', 'total', 'size'].forEach(id => {
        document.getElementById(id + '-value').textContent = '--';
        document.getElementById('stat-' + id).classList.remove('border-gray-300');
    });

    startTime = performance.now();
    let totalBytes = 0, firstChunk = true, ttfbTime = 0;

    try {
        const seedInput = document.getElementById('seed').value.trim();
        const seedValue = seedInput !== '' ? parseInt(seedInput) : -1;

        const fd = new FormData();
        fd.append('text', text);
        fd.append('mode', currentMode);
        fd.append('speed', speed);
        fd.append('stream', stream ? '1' : '0');
        fd.append('voice', voiceId);
        fd.append('seed', seedValue);

        if (currentMode === 'instruct') {
            const instruct = document.getElementById('instruct-text').value.trim();
            if (!instruct) {
                showToast('指令控制模式需要填写指令文本', 'info');
                btn.disabled = false; btnText.textContent = '生成语音';
                return;
            }
            fd.append('instruct_text', instruct);
        }

        if (stream) {
            const res = await fetch('/api/tts', { method: 'POST', body: fd });
            if (!res.ok) throw new Error(await res.text());
            const returnedSeed = res.headers.get('X-Seed');
            const reader = res.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (firstChunk) {
                    ttfbTime = performance.now() - startTime;
                    document.getElementById('ttfb-value').textContent = (ttfbTime / 1000).toFixed(2) + 's';
                    document.getElementById('stat-ttfb').classList.add('border-gray-300');
                    firstChunk = false;
                }
                chunks.push(value); totalBytes += value.length;
                document.getElementById('size-value').textContent = (totalBytes / 1024).toFixed(0) + 'KB';
                document.getElementById('total-value').textContent = ((performance.now() - startTime) / 1000).toFixed(1) + 's';
                const pct = Math.min(95, (totalBytes / (text.length * 500)) * 100);
                document.getElementById('progress').style.width = pct + '%';
                document.getElementById('progress-pct').textContent = Math.round(pct) + '%';
            }

            // 全部接收完毕，合并为 WAV
            const totalLen = chunks.reduce((a, c) => a + c.length, 0);
            const allPcm = new Uint8Array(totalLen);
            let off = 0;
            for (const c of chunks) { allPcm.set(c, off); off += c.length; }
            document.getElementById('start-value').textContent = ((performance.now() - startTime) / 1000).toFixed(2) + 's';
            document.getElementById('stat-start').classList.add('border-gray-300');
            const wavBlob = createWav(allPcm, 24000);
            setAudioResult(URL.createObjectURL(wavBlob), wavBlob);
            if (returnedSeed) showSeed(returnedSeed);

        } else {
            const res = await fetch('/api/tts', { method: 'POST', body: fd });
            if (!res.ok) throw new Error(await res.text());
            const returnedSeedNS = res.headers.get('X-Seed');
            ttfbTime = performance.now() - startTime;
            document.getElementById('ttfb-value').textContent = (ttfbTime / 1000).toFixed(2) + 's';
            const blob = await res.blob();
            totalBytes = blob.size;
            document.getElementById('size-value').textContent = (totalBytes / 1024).toFixed(0) + 'KB';
            document.getElementById('start-value').textContent = ((performance.now() - startTime) / 1000).toFixed(2) + 's';
            setAudioResult(URL.createObjectURL(blob), blob);
            if (returnedSeedNS) showSeed(returnedSeedNS);
        }

        const totalTime = (performance.now() - startTime) / 1000;
        document.getElementById('total-value').textContent = totalTime.toFixed(1) + 's';
        document.getElementById('stat-total').classList.add('border-gray-300');
        document.getElementById('stat-size').classList.add('border-gray-300');
        document.getElementById('progress').style.width = '100%';
        document.getElementById('progress-pct').textContent = '100%';
        document.getElementById('progress-status').textContent =
            `完成，约 ${(totalBytes / 24000 / 2).toFixed(1)} 秒音频`;
        showToast('生成完成', 'success');

    } catch (e) {
        document.getElementById('progress-status').textContent = '生成失败：' + e.message;
        showToast('生成失败：' + e.message, 'error');
        console.error(e);
    } finally {
        btn.disabled = false;
        btnText.textContent = '生成语音';
    }
}

let _lastAudioUrl = null;
let _lastAudioBlob = null;

function showSeed(seed) {
    document.getElementById('seed-value').textContent = seed;
    document.getElementById('seed-display').classList.remove('hidden');
}

function copySeedToInput() {
    const seed = document.getElementById('seed-value').textContent;
    document.getElementById('seed').value = seed;
    showToast('Seed 已复制到输入框', 'success');
}

function setAudioResult(url, blob = null) {
    _lastAudioUrl = url;
    _lastAudioBlob = blob;
    document.getElementById('audio-output').src = url;
    document.getElementById('audio-wrap').classList.remove('hidden');
    document.getElementById('download-btn').onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cosyvoice_' + Date.now() + '.wav';
        a.click();
    };
}

async function downloadNormalized() {
    if (!_lastAudioUrl) return showToast('请先生成音频', 'info');
    const btn = document.getElementById('normalize-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>归一化中...';
    try {
        // 获取音频 blob
        let blob = _lastAudioBlob;
        if (!blob) {
            const res = await fetch(_lastAudioUrl);
            blob = await res.blob();
        }
        const fd = new FormData();
        fd.append('audio', new File([blob], 'audio.wav', { type: 'audio/wav' }));
        fd.append('lufs', '-16');
        const res = await fetch('/api/audio/normalize', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(await res.text());
        const normBlob = await res.blob();
        const url = URL.createObjectURL(normBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cosyvoice_-16lufs_' + Date.now() + '.wav';
        a.click();
        showToast('归一化完成（-16 LUFS）', 'success');
    } catch (e) {
        showToast('归一化失败：' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sliders-h mr-1.5"></i>归一化下载 <span class="text-xs text-gray-400">-16 LUFS</span>';
    }
}

function createWav(pcmData, sampleRate) {
    const buf  = new ArrayBuffer(44 + pcmData.length);
    const view = new DataView(buf);
    const ws   = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); view.setUint32(4, 36 + pcmData.length, true);
    ws(8, 'WAVE'); ws(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ws(36, 'data'); view.setUint32(40, pcmData.length, true);
    new Uint8Array(buf, 44).set(pcmData);
    return new Blob([buf], { type: 'audio/wav' });
}

// ── GPU 状态 ──────────────────────────────────────────
async function offloadGPU() {
    await fetch('/api/offload', { method: 'POST' });
    showToast('显存已释放', 'info');
    updateStatus();
}

let _voicesLoaded = false;
async function updateStatus() {
    try {
        const res  = await fetch('/api/status');
        const data = await res.json();
        const dot  = document.getElementById('gpu-dot');
        const text = document.getElementById('gpu-text');
        if (data.model_loaded) {
            dot.className = 'fas fa-circle text-green-500';
            dot.style.fontSize = '6px';
            text.textContent = `${data.gpu.memory_used} / ${data.gpu.memory_total}`;
            // 模型就绪后确保音色列表已加载
            if (!_voicesLoaded) {
                await refreshVoices();
                _voicesLoaded = true;
            }
        } else {
            dot.className = 'fas fa-circle text-gray-300';
            dot.style.fontSize = '6px';
            text.textContent = '加载中...';
            _voicesLoaded = false;
        }
    } catch (e) { console.error(e); }
}

// ── 初始化 ────────────────────────────────────────────
async function init() {
    await updateStatus();
    await refreshVoices();
    // 若服务未就绪，每5秒重试一次，最多等60秒
    let retries = 0;
    const sel = document.getElementById('voice-select');
    const timer = setInterval(async () => {
        retries++;
        if (retries > 12) { clearInterval(timer); return; }
        try {
            const res = await fetch('/v1/voices/custom');
            if (res.ok) {
                await refreshVoices();
                clearInterval(timer);
            }
        } catch (e) {}
    }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    setInterval(updateStatus, 30000);
});