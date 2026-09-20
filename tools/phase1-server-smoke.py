#!/usr/bin/env python3
"""Destructive-only-to-self smoke test for an already deployed phase-one server."""
import datetime
import json
import os
import pathlib
import secrets
import subprocess
import urllib.error
import urllib.request

BASE = os.environ.get("PLATFORM_BASE_URL", "http://127.0.0.1:18080")
HOME_DIR = pathlib.Path.home()
MYSQL_CONFIG = HOME_DIR / ".config/risk-platform/mysql-admin.cnf"
username = "phase1-smoke-" + secrets.token_hex(4)
password = secrets.token_urlsafe(24)
token = None
user_id = station_id = device_id = pipeline_id = dataset_id = None


def sql(statement):
    return subprocess.check_output([
        "mysql", "--defaults-extra-file=" + str(MYSQL_CONFIG), "-N", "-B",
        "risk_platform_db", "-e", statement
    ], text=True).strip()


def request(path, body=None, method=None, expected=200, headers=None, raw=None):
    request_headers = dict(headers or {})
    if token:
        request_headers["Authorization"] = "Bearer " + token
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            if response.status != expected:
                raise AssertionError((path, response.status, expected))
            content = response.read()
            return json.loads(content) if content else None
    except urllib.error.HTTPError as error:
        content = error.read().decode()
        if error.code == expected:
            return json.loads(content) if content else None
        raise AssertionError((path, error.code, expected, content))


def multipart(fields, filename, content):
    boundary = "----phase1-" + secrets.token_hex(12)
    pieces = []
    for name, value in fields.items():
        pieces.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    pieces.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: text/csv\r\n\r\n".encode() + content + b"\r\n")
    pieces.append(f"--{boundary}--\r\n".encode())
    return b"".join(pieces), "multipart/form-data; boundary=" + boundary


try:
    registration = request("/api/auth/register", {"username": username, "password": password, "realName": "阶段一部署自检"}, expected=201)
    user_id = int(registration["userId"])
    sql("INSERT INTO user_roles(user_id,role_id) SELECT %d,id FROM roles WHERE role_name='Administrator'" % user_id)
    token = request("/api/auth/login", {"username": username, "password": password})["token"]
    suffix = secrets.token_hex(3).upper()
    station_id = request("/api/stations", {"code": "SMOKE-S-" + suffix, "name": "部署自检站", "stationType": "GNSS", "enabled": True, "region": "测试区", "longitude": 116.3, "latitude": 39.9, "coordinateSystem": "WGS84"}, expected=201)["id"]
    device_code = "SMOKE-D-" + suffix
    device_id = request("/api/devices", {"code": device_code, "name": "部署自检设备", "stationId": station_id, "deviceType": "GNSS_DISPLACEMENT", "metricCode": "vertical_displacement", "intervalSeconds": 30, "protocol": "HTTP"}, expected=201)["id"]
    pipeline_id = request("/api/pipeline-segments", {"code": "SMOKE-P-" + suffix, "name": "部署自检管段", "pipelineType": "GAS", "region": "测试区", "lengthKm": 1.2, "dataSource": "自动化测试", "enabled": True}, expected=201)["id"]
    request(f"/api/devices/{device_id}/pipeline-segments", {"pipelineSegmentIds": [pipeline_id]}, method="PUT")
    device_key = request(f"/api/devices/{device_id}/credentials", method="POST")["deviceKey"]
    observed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    observation = {"deviceCode": device_code, "messageId": "network-1", "eventTime": observed_at, "metricCode": "vertical_displacement", "value": 1.7, "unit": "mm", "sourceType": "REAL"}
    device_headers = {"X-Device-Code": device_code, "X-Device-Key": device_key}
    first = request("/api/device-ingest/observations", observation, headers=device_headers)
    duplicate = request("/api/device-ingest/observations", observation, headers=device_headers)
    assert first["id"] == duplicate["id"] and duplicate["duplicate"] is True
    request("/api/device-ingest/observations", observation, headers={"X-Device-Code": device_code, "X-Device-Key": "wrong"}, expected=401)
    csv = ("device_code,message_id,event_time,metric_code,value,unit,source_type\n" + device_code + ",csv-1," + observed_at + ",vertical_displacement,1.8,mm,REAL\n").encode()
    payload, content_type = multipart({"code": "SMOKE-DATA-" + suffix, "name": "部署自检数据", "sourceType": "REAL", "useScope": "自动化测试"}, "smoke.csv", csv)
    job = request("/api/datasets/import-jobs", expected=201, headers={"Content-Type": content_type}, raw=payload)
    assert job["status"] == "VALIDATED" and job["error_rows"] == 0
    dataset_id = int(job["dataset_id"])
    published = request(f"/api/datasets/{dataset_id}/publish", method="POST")
    assert published["inserted"] == 1
    assert len(request("/api/device-ingest/logs?limit=10")) >= 3
    assert len(request("/api/audit-logs?limit=20")) >= 5
    print("PASS: phase-one server flow: profile, pipeline, credential, HTTP retry, rejected audit, CSV validation and publish")
finally:
    if device_id:
        sql("DELETE oc FROM observation_context oc JOIN observation o ON o.id=oc.observation_id WHERE o.device_id=%d" % device_id)
        sql("DELETE FROM observation WHERE device_id=%d" % device_id)
        sql("DELETE FROM ingest_request_log WHERE device_id=%d" % device_id)
        sql("DELETE FROM device_credential WHERE device_id=%d" % device_id)
        sql("DELETE FROM device_pipeline_relation WHERE device_id=%d" % device_id)
        sql("DELETE FROM simulation_job WHERE device_id=%d" % device_id)
        sql("DELETE FROM device_profile WHERE device_id=%d" % device_id)
        sql("DELETE FROM device WHERE id=%d" % device_id)
    if dataset_id:
        job_ids = sql("SELECT id FROM import_job WHERE dataset_id=%d" % dataset_id).splitlines()
        for job_id in job_ids:
            sql("DELETE FROM import_staging WHERE job_id=%d" % int(job_id))
        sql("DELETE FROM import_job WHERE dataset_id=%d" % dataset_id)
        sql("DELETE FROM dataset_original_file WHERE dataset_id=%d" % dataset_id)
        sql("DELETE FROM dataset WHERE id=%d" % dataset_id)
    if pipeline_id:
        sql("DELETE FROM pipeline_segment WHERE id=%d" % pipeline_id)
    if station_id:
        sql("DELETE FROM station_profile WHERE station_id=%d" % station_id)
        sql("DELETE FROM station WHERE id=%d" % station_id)
    if user_id:
        sql("DELETE FROM audit_log WHERE actor_id=%d" % user_id)
        sql("DELETE FROM user_roles WHERE user_id=%d" % user_id)
        sql("DELETE FROM users WHERE id=%d" % user_id)
