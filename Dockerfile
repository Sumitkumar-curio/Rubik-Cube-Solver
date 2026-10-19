FROM python:3.12-slim

WORKDIR /app
COPY . .

ENV HOST=0.0.0.0
ENV PORT=8765
EXPOSE 8765

# Pre-build solver tables at image build time (faster first request)
RUN python3 -c "import sys; sys.path.insert(0,'backend'); from cube.tables import TABLES; TABLES.ensure()"

CMD ["python3", "backend/server.py"]
