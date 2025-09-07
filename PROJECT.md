# PeptiFit Project

## Current Status
- Working authentication system
- Basic peptide tracking (Tirzepatide, Retatrutide, MOTS-C, Selank)
- Dose logging with history
- HTTPS deployment at https://peptifit.trotters-stuff.uk
- Push notification infrastructure (ready for scheduling)

## Architecture
- Frontend: Next.js (React) with Tailwind CSS
- Backend: Node.js/Express with SQLite
- Deployment: Docker Compose with nginx reverse proxy
- SSL: Let's Encrypt certificates

## Planned Features
- Shotsy-style visual interface
- Pharmacokinetic graphs for tirzepatide/retatrutide
- Stock/vial management
- Dose scheduling with 15-minute reminders
- Additional peptides: ARA-290, KPV, GLOW 70, etc.

## Development Commands
- Start: `docker-compose up -d`
- Rebuild: `docker-compose up --build -d`
- Logs: `docker-compose logs [service]`
- Stop: `docker-compose down`
