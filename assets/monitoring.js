(function () {
    'use strict';
    let stations = [], devices = [], metrics = [], pipelines = [], datasets = [], ingestLogs = [], summary = {}, selected = null, offset = 0, busy = false, historyVersion = 0;
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
    async function apiForm(path, formData) {
        const response = await fetch('/api' + path, {method:'POST', headers:{Authorization:'Bearer ' + (localStorage.getItem('auth_token') || '')}, body:formData});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `上传失败 ${response.status}`);
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
        options('#relation-form [name="deviceId"]', devices, i => `${i.code} · ${i.name}`);
        const relationSelect=$('#relation-form [name="pipelineSegmentIds"]');
        relationSelect.innerHTML=pipelines.map(i=>`<option value="${i.id}">${escape(i.code)} · ${escape(i.name)}</option>`).join('');
        $('#station-rows').innerHTML = stations.map(s => `<tr><td>${escape(s.code)}</td><td>${escape(s.name)}<br>${escape(s.stationType)} · ${s.enabled?'启用':'停用'}</td><td>${escape(s.region)}</td><td>${escape(s.longitude)}, ${escape(s.latitude)} (${escape(s.coordinateSystem)})</td><td><button data-station-edit="${s.id}">编辑</button></td></tr>`).join('') || '<tr><td colspan="5">暂无站点，请先新增。</td></tr>';
        $('#pipeline-rows').innerHTML=pipelines.map(p=>`<tr><td>${escape(p.code)}</td><td>${escape(p.name)}</td><td>${escape(({GAS:'燃气',WATER:'供水',HEATING:'供热',OTHER:'其他'})[p.pipelineType]||p.pipelineType)}</td><td>${escape(p.region)}</td><td>${p.lengthKm} km</td><td>${escape(p.dataSource)}</td><td>${p.deviceCount}</td><td><button data-pipeline-edit="${p.id}">编辑</button></td></tr>`).join('')||'<tr><td colspan="8">暂无管段。</td></tr>';
        const pipelineNames=idList=>(idList||[]).map(id=>pipelines.find(p=>p.id===id)?.code||id).join('、')||'未关联';
        $('#device-rows').innerHTML = devices.map(d => `<tr><td>${escape(d.code)}</td><td>${escape(d.name)}</td><td>${escape(d.stationName)}</td><td>${escape(d.metricCode)} / ${escape(d.unit)}<br>${escape(d.protocol)}</td><td>${d.intervalSeconds}秒</td><td>${d.enabled?'启用':'停用'}</td><td>${when(d.lastReceivedAt)}<br>${({RECENT:'近期有上报',STALE:'超过3个上报周期未收到数据',NO_DATA:'尚无数据'})[d.communicationStatus]}</td><td>模拟 ${d.simulatedCount}<br>真实 ${d.realCount}</td><td>${d.credentialConfigured?`已配置 ${escape(d.credentialPrefix)}…<br>最近使用：${when(d.credentialLastUsedAt)}`:'未配置'}</td><td>${escape(pipelineNames(d.pipelineSegmentIds))}</td><td><div class="monitor-actions"><button data-device-edit="${d.id}">编辑</button><button data-status="${d.id}">${d.enabled?'停用':'启用'}</button><button data-credential="${d.id}">${d.credentialConfigured?'轮换密钥':'生成密钥'}</button><button data-relation-edit="${d.id}">关联管段</button><button data-simulation-edit="${d.id}">配置模拟</button>${d.simulationEnabled?`<button data-simulation-stop="${d.id}">停止模拟</button>`:''}<button data-history="${d.id}">最新与历史</button></div></td></tr>`).join('') || '<tr><td colspan="11">暂无设备，请先选择站点登记设备。</td></tr>';
        $('#dataset-rows').innerHTML=datasets.map(d=>`<tr><td>${escape(d.code)}</td><td>${escape(d.name)}</td><td>${escape(source(d.source_type))}</td><td>${escape(d.use_scope)}</td><td>${escape(d.status)}</td><td>${d.valid_rows??0} / ${d.error_rows??0} / ${d.total_rows??0}</td><td>${escape(d.original_filename)}</td><td>${d.status==='VALIDATED'?`<button data-publish="${d.id}">发布入库</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="8">暂无数据集。</td></tr>';
        $('#ingest-log-rows').innerHTML=ingestLogs.map(l=>`<tr><td>${when(l.createdAt)}</td><td>${escape(l.deviceCode||'未知')}</td><td>${escape(l.messageId||'—')}</td><td>${escape(l.status)}</td><td>${l.httpStatus}</td><td>${escape(l.detail||'—')}</td><td>${escape(l.remoteAddress||'—')}</td></tr>`).join('')||'<tr><td colspan="7">暂无设备接入记录。</td></tr>';
        $('#monitor-count').textContent = `已登记 ${stations.length} 个站点、${devices.length} 台设备。通信状态按到达时间估算，不代表真实设备心跳。`;
        const bySource=summary.bySource||{};
        $('#monitor-summary').textContent=`累计 ${summary.total||0} 条（模拟 ${bySource.SIMULATED||0}、真实 ${bySource.REAL||0}、未知 ${bySource.UNKNOWN||0}），自动模拟运行 ${summary.runningSimulators||0} 个。`;
    }
    async function refresh() {
        if (busy) return;
        busy = true;
        try {
            [stations,devices,metrics,pipelines,datasets,ingestLogs,summary] = await Promise.all([api('/stations'),api('/devices'),api('/metrics/definitions'),api('/pipeline-segments'),api('/datasets'),api('/device-ingest/logs?limit=100'),api('/monitoring/summary')]);
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
            (kind==='stations'?['longitude','latitude']:kind==='devices'?['stationId','intervalSeconds']:['lengthKm']).forEach(k=>body[k]=Number(body[k]));
            if(kind==='stations')body.enabled=body.enabled==='true';
            if(kind==='pipeline-segments')body.enabled=body.enabled==='true';
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
    $('#pipeline-form').addEventListener('submit',e=>save(e,'pipeline-segments'));
    $('#monitor-refresh').addEventListener('click',refresh);
    root.addEventListener('click',async e=>{
        const b=e.target.closest('button');if(!b)return;
        try {
            if(b.dataset.reset)reset($('#'+b.dataset.reset));
            if(b.dataset.stationEdit)fill($('#station-form'),stations.find(s=>s.id===Number(b.dataset.stationEdit)));
            if(b.dataset.deviceEdit)fill($('#device-form'),devices.find(d=>d.id===Number(b.dataset.deviceEdit)));
            if(b.dataset.pipelineEdit)fill($('#pipeline-form'),pipelines.find(p=>p.id===Number(b.dataset.pipelineEdit)));
            if(b.dataset.status){const d=devices.find(i=>i.id===Number(b.dataset.status));b.disabled=true;await api(`/devices/${d.id}/status`,'PATCH',{enabled:!d.enabled});await refresh();}
            if(b.dataset.relationEdit){const d=devices.find(i=>i.id===Number(b.dataset.relationEdit)),f=$('#relation-form');f.elements.deviceId.value=d.id;[...f.elements.pipelineSegmentIds.options].forEach(o=>o.selected=(d.pipelineSegmentIds||[]).includes(Number(o.value)));f.scrollIntoView({behavior:'smooth',block:'center'});}
            if(b.dataset.credential){const d=devices.find(i=>i.id===Number(b.dataset.credential));b.disabled=true;const result=await api(`/devices/${d.id}/credentials`,'POST');$('#device-ingest-example').textContent=`请立即保存此密钥（页面刷新后无法再次查看）：\n${result.deviceKey}\n\n持续上报示例：\ncurl -X POST '${location.origin}/api/device-ingest/observations' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Device-Code: ${d.code}' \\\n  -H 'X-Device-Key: ${result.deviceKey}' \\\n  -d '{"deviceCode":"${d.code}","messageId":"设备端唯一消息ID","eventTime":"${new Date().toISOString()}","metricCode":"${d.metricCode}","value":1.62,"unit":"${d.unit}","sourceType":"REAL"}'`;await refresh();message('设备密钥已生成。请立即从示例框安全保存；再次轮换会使旧密钥失效。');}
            if(b.dataset.publish){b.disabled=true;const result=await api(`/datasets/${b.dataset.publish}/publish`,'POST');await refresh();message(`数据集已发布：新增 ${result.inserted} 条，重复 ${result.duplicates} 条。`);}
            if(b.dataset.simulationEdit){const d=devices.find(i=>i.id===Number(b.dataset.simulationEdit)),f=$('#simulation-form');f.elements.deviceId.value=d.id;f.elements.baseValue.value=d.simulationBase??1.5;f.elements.amplitude.value=d.simulationAmplitude??0.3;f.elements.intervalSeconds.value=d.simulationInterval??10;f.scrollIntoView({behavior:'smooth',block:'center'});}
            if(b.dataset.simulationStop){b.disabled=true;await api(`/devices/${b.dataset.simulationStop}/simulation`,'DELETE');await refresh();message('自动模拟已停止，既有模拟记录保留。');}
            if(b.dataset.history){await showHistory(b.dataset.history);$('#history-panel').scrollIntoView({behavior:'smooth'});}
        }catch(err){message(err.message,true);}finally{if(b.dataset.status||b.dataset.simulationStop||b.dataset.credential||b.dataset.publish)b.disabled=false;}
    });
    $('#relation-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;try{const id=Number(f.elements.deviceId.value),ids=[...f.elements.pipelineSegmentIds.selectedOptions].map(o=>Number(o.value));await api(`/devices/${id}/pipeline-segments`,'PUT',{pipelineSegmentIds:ids});await refresh();message('设备与管段关系已保存。');}catch(err){message(err.message,true);}finally{b.disabled=false;}});
    $('#dataset-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('[type="submit"]');b.disabled=true;try{const job=await apiForm('/datasets/import-jobs',new FormData(f));const errors=job.errors||[];$('#import-result').textContent=`状态：${job.status}\n总行数：${job.total_rows}\n有效：${job.valid_rows}\n错误：${job.error_rows}`+(errors.length?'\n\n'+errors.map(i=>`第 ${i.row_number} 行：${i.error_message}`).join('\n'):'\n\n校验通过，可在数据集列表中发布入库。');await refresh();message(job.error_rows?'文件已校验，请修正错误后使用新数据集编号重新上传。':'CSV 校验通过，等待管理员发布。',job.error_rows>0);}catch(err){message(err.message,true);}finally{b.disabled=false;}});
    $('#download-template').addEventListener('click',async()=>{try{const response=await fetch('/api/datasets/import-template',{headers:{Authorization:'Bearer '+(localStorage.getItem('auth_token')||'')}});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||'模板下载失败');}const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='observation-import-template.csv';a.click();URL.revokeObjectURL(url);}catch(err){message(err.message,true);}});
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
