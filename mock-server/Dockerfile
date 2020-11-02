FROM python:3

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY mock_server.py .

CMD [ "python", "./mock_server.py" ]
