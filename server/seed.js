import { db } from './db.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const experts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'experts.json'), 'utf8'))

const count = db.prepare('SELECT COUNT(*) c FROM experts').get().c
if (count > 0) {
  console.log(`already seeded (${count} experts)`)
} else {
  const insert = db.prepare(
    `INSERT INTO experts (name, name_ar, job, city, rate, rating, reviews_count, image, phone, skills, experience, lat, lng)
     VALUES (@name, @nameAr, @job, @city, @rate, @rating, @reviews, @image, @phone, @skills, @experience, @lat, @lng)`,
  )
  const tx = db.transaction((rows) => {
    for (const e of rows) {
      insert.run({
        name: e.personName,
        nameAr: e.nameAr || null,
        job: e.jobName,
        city: e.location,
        rate: e.hourlyRate,
        rating: e.rating,
        reviews: e.reviews,
        image: e.image,
        phone: e.phoneNumber,
        skills: JSON.stringify(e.skills || []),
        experience: e.experience,
        lat: e.lat ?? null,
        lng: e.lng ?? null,
      })
    }
  })
  tx(experts)
  console.log(`seeded ${experts.length} experts`)
}

const users = db.prepare('SELECT COUNT(*) c FROM users').get().c
if (users === 0) {
  db.prepare('INSERT INTO users (phone, name, city) VALUES (?, ?, ?)').run('+216000000000', 'Demo Customer', 'Tunis')
  console.log('seeded demo customer')
}
