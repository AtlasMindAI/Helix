cd frontend
pkill -f "next dev" || true
rm -rf .next out .next_dev
npm run dev --turbo > next_dev_new.log 2>&1 &
