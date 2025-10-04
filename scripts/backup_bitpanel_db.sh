#!/bin/bash

# --- Detecta o SO e define os comandos date e grep apropriados ---
# Para macOS, usa as versões GNU instaladas via Homebrew (gdate, ggrep)
# Para Linux, usa as versões padrão (date, grep)
if [[ "$(uname)" == "Darwin" ]]; then # Detecta macOS
    DATE_CMD="gdate"
    GREP_CMD="ggrep"
    # Verifica se gdate e ggrep existem, caso contrário, tenta usar os padrões e falha se as opções não existirem
    if ! command -v gdate &> /dev/null; then
        echo "[$(date +"%Y%m%d_%H%M%S")] AVISO: gdate nao encontrado. Tentando usar date padrao. Pode falhar no macOS."
        DATE_CMD="date"
    fi
    if ! command -v ggrep &> /dev/null; then
        echo "[$(date +"%Y%m%d_%H%M%S")] AVISO: ggrep nao encontrado. Tentando usar grep padrao. Pode falhar no macOS."
        GREP_CMD="grep"
    fi
else # Assume Linux ou outro Unix-like
    DATE_CMD="date"
    GREP_CMD="grep"
fi


# --- 1. DETECÇÃO DINÂMICA DE CAMINHOS ---
PROJECT_ROOT=$(dirname "$(dirname "$(readlink -f "$0")")")
HOME_DIR="${HOME}"

# --- 2. CARREGAR VARIÁVEIS DO .env DO PROJETO ---
if [ -f "${PROJECT_ROOT}/.env" ]; then
    source "${PROJECT_ROOT}/.env"
else
    echo "[$(date +"%Y%m%d_%H%M%S")] ERRO: Arquivo .env nao encontrado em ${PROJECT_ROOT}/.env. Abortando."
    exit 1
fi

# --- 3. CONFIGURAÇÕES PRINCIPAIS ---
DB_PATH="${PROJECT_ROOT}/${DB_NAME}"
BACKUP_BASE_DIR="${HOME_DIR}/backups"
BACKUP_PROJECT_DIR="${BACKUP_BASE_DIR}/$(basename "${PROJECT_ROOT}")_db"

TIMESTAMP=$(${DATE_CMD} +"%Y%m%d_%H%M%S") # Usa DATE_CMD
BACKUP_FILE="${BACKUP_PROJECT_DIR}/${DB_NAME}_${TIMESTAMP}.bak"

# --- 4. VARIÁVEIS DE RETENÇÃO (FLEXÍVEL!) ---
RETAIN_DAILY_DAYS=7
RETAIN_WEEKLY_WEEKS=5
RETAIN_MONTHLY_MONTHS=6

# --- 5. Mensagem de Início ---
echo "[$(date +"%Y%m%d_%H%M%S")] Iniciando backup do SQLite para ${DB_NAME} (Projeto: $(basename "${PROJECT_ROOT}"))"

# --- 6. Garante que o diretório de backup existe ---
mkdir -p "${BACKUP_PROJECT_DIR}" || { echo "[$(date +"%Y%m%d_%H%M%S")] ERRO: Nao foi possivel criar o diretorio de backup: ${BACKUP_PROJECT_DIR}"; exit 1; }

# --- 7. Executa o backup usando sqlite3 .backup ---
if [ ! -f "${DB_PATH}" ]; then
    echo "[$(date +"%Y%m%d_%H%M%S")] ERRO: Arquivo do banco de dados nao encontrado em ${DB_PATH}. Abortando."
    exit 1
fi

sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'" ".quit" 2>&1

# --- 8. Verifica se o backup foi bem-sucedido ---
if [ $? -eq 0 ]; then
    echo "[$(date +"%Y%m%d_%H%M%S")] Backup de ${DB_NAME} concluído com sucesso em ${BACKUP_FILE}"
    
    # --- 9. POLÍTICA DE LIMPEZA DE BACKUPS (AVANÇADA) ---
    echo "[$(date +"%Y%m%d_%H%M%S")] Iniciando limpeza de backups..."

    ALL_BACKUPS_LIST=$(find "${BACKUP_PROJECT_DIR}" -name "${DB_NAME}_*.bak" -type f -print0 | xargs -0 ls -t)

    backups_to_keep=""
    
    # --- Regra 1: Manter os últimos N backups diários ---
    echo "   -> Mantendo os últimos ${RETAIN_DAILY_DAYS} backups diários."
    count=0
    while IFS= read -r backup_file; do
        if [ -n "$backup_file" ]; then
            if (( count < RETAIN_DAILY_DAYS )); then
                backups_to_keep="${backups_to_keep}${backup_file}\n"
                ((count++))
            fi
        fi
    done <<< "$ALL_BACKUPS_LIST"


    # --- Regra 2: Manter os backups das últimas N quintas-feiras ---
    echo "   -> Mantendo os backups das últimas ${RETAIN_WEEKLY_WEEKS} quintas-feiras."
    for ((w=0; w<RETAIN_WEEKLY_WEEKS; w++)); do
        WEEKLY_DATE=$(${DATE_CMD} -d "last thursday -${w} week" +"%Y%m%d") # Usa DATE_CMD
        
        found_for_week=0
        while IFS= read -r backup_file; do
            if [ -n "$backup_file" ]; then
                backup_filename=$(basename "${backup_file}")
                backup_date_part=$(echo "${backup_filename}" | ${GREP_CMD} -oP "${DB_NAME}_\K[0-9]{8}") # Usa GREP_CMD
                
                if [[ "${backup_date_part}" == "${WEEKLY_DATE}" ]]; then
                    if ! echo -e "${backups_to_keep}" | ${GREP_CMD} -q "^${backup_file}$"; then # Usa GREP_CMD
                        backups_to_keep="${backups_to_keep}${backup_file}\n"
                    fi
                    found_for_week=1
                    break
                fi
            fi
        done <<< "$ALL_BACKUPS_LIST"
    done

    # --- Regra 3: Manter os backups do dia 5 dos últimos N meses ---
    echo "   -> Mantendo os backups do dia 05 dos últimos ${RETAIN_MONTHLY_MONTHS} meses."
    for ((m=0; m<RETAIN_MONTHLY_MONTHS; m++)); do
        MONTH_TARGET_DATE=$(${DATE_CMD} -d "-${m} months" +"%Y%m")"05" # Usa DATE_CMD
        
        found_for_month=0
        while IFS= read -r backup_file; do
            if [ -n "$backup_file" ]; then
                backup_filename=$(basename "${backup_file}")
                backup_date_part=$(echo "${backup_filename}" | ${GREP_CMD} -oP "${DB_NAME}_\K[0-9]{8}") # Usa GREP_CMD
                
                if [[ "${backup_date_part}" == "${MONTH_TARGET_DATE}" ]]; then
                    if ! echo -e "${backups_to_keep}" | ${GREP_CMD} -q "^${backup_file}$"; then # Usa GREP_CMD
                        backups_to_keep="${backups_to_keep}${backup_file}\n"
                    fi
                    found_for_month=1
                    break
                fi
            fi
        done <<< "$ALL_BACKUPS_LIST"
    done

    # --- Remover backups que NÃO estão na lista 'backups_to_keep' ---
    while IFS= read -r backup_file; do
        if [ -n "$backup_file" ]; then
            if ! echo -e "${backups_to_keep}" | ${GREP_CMD} -q "^${backup_file}$"; then # Usa GREP_CMD
                echo "      -> Removendo: ${backup_file}"
                rm -f "${backup_file}"
            fi
        fi
    done <<< "$ALL_BACKUPS_LIST"

    echo "[$(date +"%Y%m%d_%H%M%S")] Limpeza de backups concluída."
else
    echo "[$(date +"%Y%m%d_%H%M%S")] ERRO: Falha ao fazer backup de ${DB_NAME}. Verifique as permissoes ou o caminho."
    exit 1 
fi

echo "[$(date +"%Y%m%d_%H%M%S")] Backup script finalizado."