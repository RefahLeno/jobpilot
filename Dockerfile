FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PYTHON_BIN=/opt/venv/bin/python
ENV PATH="/opt/venv/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/python -m pip install --upgrade pip \
  && /opt/venv/bin/python -m pip install -r requirements.txt

COPY . .

CMD ["npm", "start"]
