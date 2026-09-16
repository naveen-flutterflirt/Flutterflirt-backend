require('dotenv').config();
const { pool } = require('../src/config/db');

async function seedIoT() {
  const client = await pool.connect();
  try {
    console.log('Seeding initial IoT lectures and Niva kit access codes...');
    await client.query('BEGIN');

    // Seed default Kit Access Codes
    const sampleCodes = [
      {
        code: 'NIVA-IOT-2025',
        description: 'Official Niva IoT Hardware Kit Activation Code',
        max_uses: 1000,
        times_used: 0,
        is_active: true
      },
      {
        code: 'FLUTTER-KIT-DEMO',
        description: 'Demo Kit Access Code for FlutterFlirt Reviewers',
        max_uses: 100,
        times_used: 0,
        is_active: true
      },
      {
        code: 'NIVA-HARDWARE-PASS',
        description: 'Niva Hardware Kit Verified Purchase Voucher',
        max_uses: 500,
        times_used: 0,
        is_active: true
      }
    ];

    for (const item of sampleCodes) {
      await client.query(
        `INSERT INTO iot_access_codes (code, description, max_uses, times_used, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE 
         SET is_active = EXCLUDED.is_active,
             max_uses = EXCLUDED.max_uses;`,
        [item.code, item.description, item.max_uses, item.times_used, item.is_active]
      );
    }
    console.log('Kit access codes seeded successfully.');

    // Seed initial syllabus lectures if table is empty
    const checkLectures = await client.query(`SELECT count(*) FROM iot_lectures`);
    if (parseInt(checkLectures.rows[0].count, 10) === 0) {
      const initialLectures = [
        {
          title: 'Module 1: Introduction to Embedded IoT & Hardware Architecture',
          slug: 'module-1-introduction-to-embedded-iot',
          description: 'Comprehensive overview of Internet of Things architecture, microcontrollers vs microprocessors, ESP32 pinout, breadboard basics, and getting started with the official Niva Hardware Kit.',
          s3_key: 'iot-lectures/videos/module-1-intro.mp4',
          video_url: 'https://flutterflirt.com.s3.ap-southeast-1.amazonaws.com/iot-lectures/videos/module-1-intro.mp4',
          duration: '18:40',
          sequence_order: 1,
          is_preview: false,
          thumbnail_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200',
          resources: JSON.stringify([
            { title: 'ESP32 Pinout Cheat Sheet PDF', url: '#' },
            { title: 'Breadboard Circuit Schematic', url: '#' }
          ])
        },
        {
          title: 'Module 2: Sensors, Actuators & Real-Time Signal Processing',
          slug: 'module-2-sensors-actuators-signal-processing',
          description: 'Hands-on wiring with DHT22 temperature & humidity sensors, ultrasonic distance measurement, analog-to-digital conversions (ADC), PWM controls, and LED feedback indicators.',
          s3_key: 'iot-lectures/videos/module-2-sensors.mp4',
          video_url: 'https://flutterflirt.com.s3.ap-southeast-1.amazonaws.com/iot-lectures/videos/module-2-sensors.mp4',
          duration: '24:15',
          sequence_order: 2,
          is_preview: false,
          thumbnail_url: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?q=80&w=1200',
          resources: JSON.stringify([
            { title: 'Sensor Calibration Arduino Sketch (.ino)', url: '#' },
            { title: 'Datasheets for Ultrasonic & DHT22', url: '#' }
          ])
        },
        {
          title: 'Module 3: Wi-Fi Networking, MQTT Protocol & Cloud Telemetry',
          slug: 'module-3-wifi-mqtt-cloud-telemetry',
          description: 'Connecting your ESP32 to Wi-Fi, implementing reliable reconnect logic, publishing real-time telemetry to MQTT brokers (HiveMQ/EMQX), and receiving bidirectional remote commands.',
          s3_key: 'iot-lectures/videos/module-3-mqtt.mp4',
          video_url: 'https://flutterflirt.com.s3.ap-southeast-1.amazonaws.com/iot-lectures/videos/module-3-mqtt.mp4',
          duration: '31:20',
          sequence_order: 3,
          is_preview: false,
          thumbnail_url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?q=80&w=1200',
          resources: JSON.stringify([
            { title: 'MQTT Publisher & Subscriber Code Sample', url: '#' },
            { title: 'Cloud Broker Setup Guide', url: '#' }
          ])
        },
        {
          title: 'Module 4: Building Real-Time IoT Dashboards & Remote Control',
          slug: 'module-4-building-real-time-iot-dashboards',
          description: 'Architecting dynamic web dashboards with WebSockets, charting live sensor readings, implementing alert thresholds, and deploying a production-ready edge automation system.',
          s3_key: 'iot-lectures/videos/module-4-dashboards.mp4',
          video_url: 'https://flutterflirt.com.s3.ap-southeast-1.amazonaws.com/iot-lectures/videos/module-4-dashboards.mp4',
          duration: '28:50',
          sequence_order: 4,
          is_preview: false,
          thumbnail_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200',
          resources: JSON.stringify([
            { title: 'Next.js IoT Dashboard Starter Repo', url: '#' },
            { title: 'Firmware Over-The-Air (OTA) Guide', url: '#' }
          ])
        }
      ];

      for (const lec of initialLectures) {
        await client.query(
          `INSERT INTO iot_lectures (title, slug, description, s3_key, video_url, duration, sequence_order, is_preview, thumbnail_url, resources, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'published')`,
          [lec.title, lec.slug, lec.description, lec.s3_key, lec.video_url, lec.duration, lec.sequence_order, lec.is_preview, lec.thumbnail_url, lec.resources]
        );
      }
      console.log('Sample IoT curriculum lectures seeded successfully.');
    } else {
      console.log('Lectures already exist, skipping lecture seed.');
    }

    await client.query('COMMIT');
    console.log('IoT Seed complete!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('IoT Seeding failed:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seedIoT();
