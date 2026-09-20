(function () {
    'use strict';
    let stations = [], devices = [], metrics = [], summary = {}, selected = null, offset = 0, busy = false, historyVersion = 0;
    const root = document.getElementById('monitoring-app');
    if (!root) return;
    const $ = (s) => root.querySelector(s);
    const escape = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const when = (v) => v ? new Date(v).toLocaleString() : '尚无数据';
    const source = (v) => ({SIMULATED:'模拟',REAL:'真实（上报方声明）',UNKNOWN:'未知'}[v] || v);
    function message(text, error = false) { $('#monitor-message').textContent = text; $('#monitor-message').classList.toggle('error', error); }
    async function api(path, method = 'GET', body) {
        const response = await fetch('/api' + path, {method, headers:{'Content-Type':'application/json',Authorization:'Bearer ' + (localStorage.getItem('auth_token') || '')}, ...(body ? {body:JSON.stringify(body)} : {})});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `接口失败 ${response.status}；请确认正在访问Java后端并已执行阶段一数据库迁移。`);
        return data;
    }
    function options(selector, items, label) {
        const el = $(selector), previous = el.value;
        el.innerHTML = '<option value="">请选择</option>' + items.map(i => `<option value="${escape(i.id ?? i.code)}">${escape(label(i))}</option>`).join('');
        el.value = previous;
    }
    function render() {
        options('[name="stationId"]', stations, i => `${i.code} · ${i.name}`);
        options('[name="metricCode"]', metrics, i => `${i.name} (${i.unit})`);
        options('#simulation-form [name="deviceId"]', devices.filter(i => i.enabled), i => `${i.code} · ${i.name}`);
        options('#observation-form [name="deviceId"]', devices.filter(i => i.enabled), i => `${i.code} · ${i.name}`);
        $('#station-rows').innerHTML = stations.map(s => `<tr><td>${escape(s.code)}</td><td>${escape(s.name)}</td><td>${escape(s.region)}</td><td>${escape(s.longitude)}, ${escape(s.latitude)} (${escape(s.coordinateSystem)})</td><td><button data-station-edit="${s.id}">编辑</button></td></tr>`).join('') || '<tr><td colspan="5">暂无站点，请先新增。</td></tr>';
        $('#device-rows').innerHTML = devices.map(d => `<tr><td>${escape(d.code)}</td><td>${escape(d.name)}</td><td>${escape(d.stationName)}</td><td>${escape(d.metricCode)} / ${escape(d.unit)}</td><td>${d.intervalSeconds}秒</td><td>${d.enabled?'启用':'停用'}</td><td>${when(d.lastReceivedAt)}<br>${({RECENT:'近期有上报',STALE:'超过3个上报周期未收到数据',NO_DATA:'尚无数据'})[d.communicationStatus]}</td><td>模拟 ${d.simulatedCount}<br>真实 ${d.realCount}</td><td>${d.simulationEnabled?`运行中 · ${d.simulationInterval}秒<br>最近：${when(d.simulationLastRunAt)}`:'未运行'}</td><td><div class="monitor-actions"><button data-device-edit="${d.id}">编辑</button><button data-status="${d.id}">${d.enabled?'停用':'启用'}</button><button data-simulation-edit="${d.id}">配置模拟</button>${d.simulationEnabled?`<button data-simulation-stop="${d.id}">停止模拟</button>`:''}<button data-history="${d.id}">最新与历史</button></div></td></tr>`).join('') || '<tr><td colspan="10">暂无设备，请先选择站点登记设备。</td></tr>';
        $('#monitor-count').textContent = `已登记 ${stations.length} 个站点、${devices.length} 台设备。通信状态按到达时间估算，不代表真实设备心跳。`;
        const bySource=summary.bySource||{};
        $('#monitor-summary').textContent=`累计 ${summary.total||0} 条（模拟 ${bySource.SIMULATED||0}、真实 ${bySource.REAL||0}、未知 ${bySource.UNKNOWN||0}），自动模拟运行 ${summary.runningSimulators||0} 个。`;
    }
    async function refresh() {
        if (busy) return;
        busy = true;
        try {
            [stations,devices,metrics,summary] = await Promise.all([api('/stations'),api('/devices'),api('/metrics/definitions'),api('/monitoring/summary')]);
            render();
            message(`已从Java后端读取，更新时间 ${new Date().toLocaleTimeString()}。其他风险专题仍为演示数据。`);
            if (selected) await showHistory(selected, offset);
        } catch(e) {message(e.message,true);} finally {busy=false;}
    }
    function fill(form, item) {
        form.dataset.editId = item.id;
        for (const [key,value] of Object.entries(item)) {const el=form.elements.namedItem(key);if(el)el.value=value;}
        form.querySelector('button[type="submit"]').textContent='保存修改';
        form.scrollIntoView({behavior:'smooth',block:'center'});
    }
    function reset(form) {form.reset();delete form.dataset.editId;form.querySelector('button[type="submit"]').textContent='新增保存';}
    async function save(event, kind) {
        event.preventDefault();const form=event.target, button=form.querySelector('[type="submit"]');button.disabled=true;
        try {
            const body=Object.fromEntries(new FormData(form));
            (kind==='stations'?['longitude','latitude']:['stationId','intervalSeconds']).forEach(k=>body[k]=Number(body[k]));
            await api('/'+kind+(form.dataset.editId?'/'+form.dataset.editId:''),form.dataset.editId?'PUT':'POST',body);
            reset(form);await refresh();message('档案已保存。');
        }catch(e){message(e.message,true);}finally{button.disabled=false;}
    }
    async function showHistory(id, nextOffset = 0) {
        selected=Number(id);offset=nextOffset;const version=++historyVersion;
        const [latest,history]=await Promise.all([api(`/devices/${id}/latest`),api(`/devices/${id}/observations?limit=20&offset=${offset}`)]);
        if(version!==historyVersion)return;
        const d=devices.find(i=>i.id===selected);
        $('#history-title').textContent=`${d?.name || id} · 最新值与历史`;
        const o=latest.observation;
        $('#monitor-latest').textContent=o?`最新采集值：${o.value} ${o.unit}；采集时间：${when(o.eventTime)}；来源：${source(o.sourceType)}。`:'尚未上报数据。';
        $('#observation-rows').innerHTML=history.items.map(i=>`<tr><td>${escape(i.messageId)}</td><td>${when(i.eventTime)}</td><td>${when(i.receivedAt)}</td><td>${i.value} ${escape(i.unit)}</td><td>${escape(source(i.sourceType))}</td></tr>`).join('') || '<tr><td colspan="5">暂无记录</td></tr>';
        $('#history-count').textContent=`共 ${history.total} 条，当前第 ${Math.floor(offset/20)+1} 页`;
        $('#history-prev').disabled=offset===0;$('#history-next').disabled=offset+20>=history.total;
    }
    $('#station-form').addEventListener('submit',e=>save(e,'stations'));
    $('#device-form').addEventListener('submit',e=>save(e,'devices'));
    $('#monitor-refresh').addEventListener('click',refresh);
    root.addEventListener('click',async e=>{
        const b=e.target.closest('button');if(!b)return;
        try {
            if(b.dataset.reset)reset($('#'+b.dataset.reset));
            if(b.dataset.stationEdit)fill($('#station-form'),stations.find(s=>s.id===Number(b.dataset.stationEdit)));
            if(b.dataset.deviceEdit)fill($('#device-form'),devices.find(d=>d.id===Number(b.dataset.deviceEdit)));
            if(b.dataset.status){const d=devices.find(i=>i.id===Number(b.dataset.status));b.disabled=true;await api(`/devices/${d.id}/status`,'PATCH',{enabled:!d.enabled});await refresh();}
            if(b.dataset.simulationEdit){const d=devices.find(i=>i.id===Number(b.dataset.simulationEdit)),f=$('#simulation-form');f.elements.deviceId.value=d.id;f.elements.baseValue.value=d.simulationBase??1.5;f.elements.amplitude.value=d.simulationAmplitude??0.3;f.elements.intervalSeconds.value=d.simulationInterval??10;f.scrollIntoView({behavior:'smooth',block:'center'});}
            if(b.dataset.simulationStop){b.disabled=true;await api(`/devices/${b.dataset.simulationStop}/simulation`,'DELETE');await refresh();message('自动模拟已停止，既有模拟记录保留。');}
            if(b.dataset.history){await showHistory(b.dataset.history);$('#history-panel').scrollIntoView({behavior:'smooth'});}
        }catch(err){message(err.message,true);}finally{if(b.dataset.status||b.dataset.simulationStop)b.disabled=false;}
    });
    $('#history-prev').addEventListener('click',()=>showHistory(selected,Math.max(0,offset-20)).catch(e=>message(e.message,true)));
    $('#history-next').addEventListener('click',()=>showHistory(selected,offset+20).catch(e=>message(e.message,true)));
    $('#observation-form').addEventListener('submit',async e=>{
        e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;
        try {
            const values=Object.fromEntries(new FormData(f)),d=devices.find(i=>i.id===Number(values.deviceId));
            if(!d)throw new Error('请选择启用的设备');
            await api('/ingest/observations','POST',{deviceCode:d.code,messageId:crypto.randomUUID(),eventTime:new Date().toISOString(),metricCode:d.metricCode,value:Number(values.value),unit:d.unit,sourceType:'SIMULATED'});
            selected=d.id;offset=0;await refresh();message('模拟监测记录已入库。该操作不触发预测算法。');
        }catch(err){message(err.message,true);}finally{b.disabled=false;}
    });
    $('#simulation-form').addEventListener('submit',async e=>{
        e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;
        try {
            const values=Object.fromEntries(new FormData(f)),id=Number(values.deviceId);
            await api(`/devices/${id}/simulation`,'PUT',{baseValue:Number(values.baseValue),amplitude:Number(values.amplitude),intervalSeconds:Number(values.intervalSeconds)});
            await refresh();message('服务器自动模拟已启动或更新；离开本页面后仍会持续运行。');
        }catch(err){message(err.message,true);}finally{b.disabled=false;}
    });
    window.monitoringRefresh=refresh;
})();
