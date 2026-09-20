#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 RELEASE_NAME RELEASE_ARCHIVE" >&2
    exit 2
fi

release_name="$1"
archive="$2"
apps_root="$HOME/apps"
release_root="$apps_root/risk-platform-releases"
release_dir="$release_root/$release_name"
current_link="$apps_root/risk-platform"
backup_root="$apps_root/risk-platform-backups"
admin_config="$HOME/.config/risk-platform/mysql-admin.cnf"
unit_root="$HOME/.config/systemd/user"

[[ "$release_name" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Invalid release name" >&2; exit 2; }
[[ -f "$archive" ]] || { echo "Release archive not found" >&2; exit 2; }
[[ -f "$admin_config" ]] || { echo "Database admin config not found" >&2; exit 2; }
mkdir -p "$release_root" "$backup_root"
[[ ! -e "$release_dir" ]] || { echo "Release already exists: $release_dir" >&2; exit 2; }

previous_target="$(readlink -f "$current_link")"
backup_file="$backup_root/risk-platform-before-$release_name.sql"
umask 077
mysqldump --defaults-extra-file="$admin_config" --single-transaction --routines --triggers risk_platform_db > "$backup_file"

mkdir "$release_dir"
tar -xzf "$archive" -C "$release_dir"
mysql --defaults-extra-file="$admin_config" risk_platform_db < "$release_dir/backend-java/src/main/resources/db/phase1-completion.sql"

ln -sfn "$release_dir" "$current_link"
sed -i "s#^WorkingDirectory=.*#WorkingDirectory=$current_link#" "$unit_root/risk-platform-java.service"
sed -i "s#^ExecStart=.*risk-platform-backend-1.0.0.jar#ExecStart=$apps_root/risk-platform-tools/jre17/bin/java -Xms128m -Xmx512m -jar $current_link/backend-java/target/risk-platform-backend-1.0.0.jar#" "$unit_root/risk-platform-java.service"
sed -i "s#^WorkingDirectory=.*#WorkingDirectory=$current_link#" "$unit_root/risk-platform-gateway.service"
sed -i "s#^ExecStart=.*server-gateway.mjs#ExecStart=/usr/bin/node $current_link/deploy/server-gateway.mjs#" "$unit_root/risk-platform-gateway.service"
systemctl --user daemon-reload

rollback() {
    ln -sfn "$previous_target" "$current_link"
    systemctl --user daemon-reload
    systemctl --user restart risk-platform-java risk-platform-gateway
    echo "Deployment failed; application link restored to $previous_target" >&2
}

if ! systemctl --user restart risk-platform-java risk-platform-gateway; then
    rollback
    exit 1
fi

healthy=false
for _ in {1..30}; do
    login_status="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/login.html || true)"
    api_status="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/api/stations || true)"
    if [[ "$login_status" == "200" && "$api_status" == "401" ]]; then
        healthy=true
        break
    fi
    sleep 1
done
if [[ "$healthy" != true ]]; then
    rollback
    exit 1
fi

echo "Deployed $release_name"
echo "Database backup: $backup_file"
echo "Previous release: $previous_target"
