const { pool } = require('../src/config/db');

const SEED_COURSES = [
  {
    code: "IOT-101",
    title: "ESP32 Embedded Architecture & C++ Fundamentals",
    slug: "esp32-embedded-architecture-fundamentals",
    badge: "Silicon & FreeRTOS",
    level: "Beginner",
    duration: "4 Lessons • 1h 42m",
    thumbnail_url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&auto=format&fit=crop&q=80",
    description: "Master Xtensa dual-core 32-bit MCU architecture, memory management, GPIO registers, and FreeRTOS multi-threading.",
    overview: "This masterclass bridges bare-metal silicon programming and modern real-time operating systems. Starting from breadboard wiring and power sequencing, you will manipulate ESP32 registers directly, schedule independent threads across both CPU cores using FreeRTOS, and generate precision pulse-width modulation for actuators.",
    hardware_used: [
      "ESP32 DevKit V1 (Xtensa Dual-Core 240MHz)",
      "830-Point Solderless Breadboard",
      "RGB Feedback LEDs & Current Limiting Resistors",
      "Tactile Push Switches & Jumper Wire Bundle"
    ],
    learning_outcomes: [
      "Navigate the complete ESP32 pinout, strappings, and ADC/DAC channels",
      "Manipulate GPIO registers directly with bitwise operations for zero-latency I/O",
      "Spawn and prioritize concurrent tasks on Core 0 and Core 1 via FreeRTOS",
      "Configure high-resolution hardware timers and PWM frequency generators"
    ],
    lessons: [
      {
        id: "l-101-1",
        sequence_order: 1,
        title: "Module 1: Introduction to Embedded IoT & Hardware Architecture",
        duration: "18:40",
        description: "Comprehensive overview of Internet of Things architecture, microcontrollers vs microprocessors, ESP32 pinout, breadboard basics, and getting started with the official Niva Hardware Kit.",
        is_preview: true
      },
      {
        id: "l-101-2",
        sequence_order: 2,
        title: "Module 2: Direct Register Manipulation & Digital I/O",
        duration: "22:15",
        description: "Deep dive into GPIO registers, bitwise masking, pull-up and pull-down configurations, hardware interrupts, and mechanical switch debouncing."
      },
      {
        id: "l-101-3",
        sequence_order: 3,
        title: "Module 3: FreeRTOS Task Scheduling & Dual-Core Affinity",
        duration: "28:30",
        description: "Pinning real-time threads to Core 0 and Core 1, task prioritization, vTaskDelay precision timing, and mutex semaphores for thread safety."
      },
      {
        id: "l-101-4",
        sequence_order: 4,
        title: "Module 4: Hardware Timers & PWM Frequency Generation",
        duration: "32:45",
        description: "Configuring high-resolution hardware timers, LEDC peripheral channels, and pulse-width modulation for LED dimming and servo motor positioning."
      }
    ],
    resources: [
      { title: "ESP32 Pinout & Memory Map Cheat Sheet (PDF)", url: "#" },
      { title: "FreeRTOS Dual-Core Firmware Starter (GitHub)", url: "#" },
      { title: "Breadboard Power Sequencing Diagram", url: "#" }
    ],
    sequence_order: 1,
    status: "published"
  },
  {
    code: "IOT-201",
    title: "Precision Sensors, ADCs & Hardware Actuators",
    slug: "precision-sensors-adcs-actuators",
    badge: "Hardware Interfacing",
    level: "Intermediate",
    duration: "4 Lessons • 1h 56m",
    thumbnail_url: "https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=900&auto=format&fit=crop&q=80",
    description: "Interface analog sensors, calibrate 12-bit SAR ADCs, communicate over I2C/SPI buses, and safely switch 220V AC appliances.",
    overview: "Real engineering requires capturing physical phenomena with high accuracy and actuating real-world machinery. In this masterclass, you will overcome the inherent non-linearity of silicon ADCs, read environmental telemetry over I2C, measure microsecond ultrasound reflections, and switch heavy AC loads with optocoupler isolation.",
    hardware_used: [
      "DHT22 Precision Digital Temperature & Humidity Sensor",
      "0.96\" I2C 128x64 Monochrome OLED Display",
      "HC-SR04 Ultrasonic Sonar Module",
      "5V Optocoupler Galvanically Isolated Relay Module"
    ],
    learning_outcomes: [
      "Calibrate 12-bit ADC channels using voltage scaling and multi-sample averaging",
      "Stream low-latency sensor telemetry to an I2C OLED display at 400kHz bus speed",
      "Measure sonar pulse echoes with microsecond timing and obstacle distance math",
      "Safely wire and actuate 220V AC appliances with optocoupled relays and flyback suppression"
    ],
    lessons: [
      {
        id: "l-201-1",
        sequence_order: 1,
        title: "Module 1: Calibrated Analog Telemetry & 12-bit SAR ADC",
        duration: "24:15",
        description: "Overcoming ESP32 ADC non-linearity, attenuation voltage scaling, multisample averaging algorithms, and analog low-pass filtering."
      },
      {
        id: "l-201-2",
        sequence_order: 2,
        title: "Module 2: Environmental Telemetry with DHT22 & I2C OLED",
        duration: "27:50",
        description: "Single-wire bidirectional bit-banging protocol for DHT22 temperature/humidity and high-speed I2C buffer streaming to SSD1306 OLED screens."
      },
      {
        id: "l-201-3",
        sequence_order: 3,
        title: "Module 3: HC-SR04 Ultrasonic Sonar & Obstacle Ranging",
        duration: "29:10",
        description: "Calculating distance via microsecond ultrasonic echo reflections, speed of sound temperature compensation, and proximity perimeter triggers."
      },
      {
        id: "l-201-4",
        sequence_order: 4,
        title: "Module 4: 220V AC Power Switching via Optocoupled Relays",
        duration: "35:10",
        description: "Optoelectronic galvanic isolation, flyback diode protection against inductive back-EMF, and building safe smart mains outlet automation."
      }
    ],
    resources: [
      { title: "DHT22 & I2C OLED Complete Wiring Schematic (PDF)", url: "#" },
      { title: "Analog ADC Calibration Algorithm (.ino)", url: "#" },
      { title: "High-Voltage AC Relay Safety Manual", url: "#" }
    ],
    sequence_order: 2,
    status: "published"
  },
  {
    code: "IOT-301",
    title: "Industrial IoT Protocols: MQTT, TLS 1.3 & WebSockets",
    slug: "industrial-iot-protocols-mqtt-tls",
    badge: "Edge Networking",
    level: "Intermediate",
    duration: "4 Lessons • 2h 05m",
    thumbnail_url: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=900&auto=format&fit=crop&q=80",
    description: "Deploy carrier-grade edge networking with non-blocking Wi-Fi state machines, TLS certificate validation, and MQTT pub/sub brokers.",
    overview: "An IoT device without reliable networking is merely an isolated circuit. Learn how to architect non-blocking Wi-Fi reconnect state machines, encrypt telemetry packets with TLS 1.3 certificates on the edge, publish data to high-throughput MQTT brokers, and handle packet drops gracefully.",
    hardware_used: [
      "ESP32 Wi-Fi & Bluetooth LE Radio",
      "HiveMQ & EMQX Cloud MQTT Brokers",
      "Wi-Fi AP & Serial UART Monitor",
      "Network Packet Sniffer (Wireshark)"
    ],
    learning_outcomes: [
      "Implement event-driven non-blocking Wi-Fi connection and reconnect loops",
      "Publish telemetry and subscribe to command topics with MQTT QoS 0, 1, and 2 guarantees",
      "Establish cryptographically verified TLS 1.3 handshakes with root CA certificates",
      "Serialize and compress sensor payloads using zero-copy binary and JSON formats"
    ],
    lessons: [
      {
        id: "l-301-1",
        sequence_order: 1,
        title: "Module 1: Resilient Wi-Fi State Machines & Auto-Reconnect",
        duration: "26:40",
        description: "Non-blocking event-driven connection loops, WPA2/WPA3 enterprise authentication, static IP DHCP leases, and Wi-Fi modem sleep states."
      },
      {
        id: "l-301-2",
        sequence_order: 2,
        title: "Module 2: MQTT Broker Architecture: HiveMQ & EMQX",
        duration: "31:20",
        description: "Publish/subscribe topology, QoS 0, 1, and 2 packet delivery contracts, topic wildcards (+ and #), and Last Will & Testament (LWT) heartbeat monitors."
      },
      {
        id: "l-301-3",
        sequence_order: 3,
        title: "Module 3: TLS 1.3 End-to-End Encryption & X.509 Certificates",
        duration: "33:15",
        description: "Cryptographic cipher handshakes, embedded root CA validation, secure flash SPIFFS key management, and preventing packet sniffing on public networks."
      },
      {
        id: "l-301-4",
        sequence_order: 4,
        title: "Module 4: Compact Telemetry Serialization (JSON vs. Protobuf)",
        duration: "34:00",
        description: "Microcontroller RAM constraints, zero-copy ArduinoJson serialization, binary Protocol Buffers encoding, and optimizing cellular/Wi-Fi payload bandwidth."
      }
    ],
    resources: [
      { title: "MQTT Topic Hierarchy Best Practices Guide", url: "#" },
      { title: "ESP32 Embedded TLS Root Certificate Bundle", url: "#" },
      { title: "HiveMQ & EMQX Broker Configuration Script", url: "#" }
    ],
    sequence_order: 3,
    status: "published"
  },
  {
    code: "IOT-401",
    title: "AWS Cloud IoT Core & Serverless Telemetry Pipelines",
    slug: "aws-cloud-iot-core-pipelines",
    badge: "Cloud & DevOps",
    level: "Advanced",
    duration: "4 Lessons • 2h 18m",
    thumbnail_url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&auto=format&fit=crop&q=80",
    description: "Ingest sensor telemetry into AWS IoT Core, write SQL stream routing rules, store time-series data in DynamoDB, and trigger alerts.",
    overview: "Scale your IoT infrastructure to thousands of concurrent devices using Amazon Web Services. This masterclass teaches you how to provision AWS IoT Things with mutual TLS, sync physical device states with AWS Device Shadows, route messages via SQL rules engines, and trigger serverless Lambda alerts.",
    hardware_used: [
      "ESP32 DevKit with AWS Mutual TLS",
      "AWS IoT Core MQTT Broker",
      "Amazon DynamoDB Time-Series Tables",
      "AWS Lambda & Simple Notification Service (SNS)"
    ],
    learning_outcomes: [
      "Provision AWS IoT Things, generate device certs, and attach fine-grained IAM policies",
      "Synchronize physical hardware state with AWS Device Shadows across network drops",
      "Execute real-time SQL filtering rules on high-throughput sensor telemetry streams",
      "Trigger automated SMS & email alerts via AWS Lambda and Amazon SNS on anomaly thresholds"
    ],
    lessons: [
      {
        id: "l-401-1",
        sequence_order: 1,
        title: "Module 1: Provisioning Devices on AWS IoT Core",
        duration: "30:20",
        description: "Creating AWS IoT Things, configuring fine-grained IAM policy permissions, generating device certificates, and verifying mutual TLS handshakes."
      },
      {
        id: "l-401-2",
        sequence_order: 2,
        title: "Module 2: Device Shadow Synchronization & Remote State",
        duration: "34:45",
        description: "Reported vs. Desired JSON shadow states, delta topic subscription handlers, and seamless device state reconciliation after network dropouts."
      },
      {
        id: "l-401-3",
        sequence_order: 3,
        title: "Module 3: AWS IoT SQL Rules Engine & DynamoDB Pipelines",
        duration: "36:15",
        description: "Writing real-time SQL filtering queries over incoming MQTT topics, zero-code ingestion into Amazon DynamoDB, and configuring automated TTL timestamp purges."
      },
      {
        id: "l-401-4",
        sequence_order: 4,
        title: "Module 4: Serverless Alarm Pipelines with AWS Lambda & SNS",
        duration: "37:00",
        description: "Triggering serverless Python/Node.js Lambda functions on anomaly thresholds, automated SMS & email alerts via Amazon SNS, and CloudWatch metrics."
      }
    ],
    resources: [
      { title: "AWS CloudFormation & IAM Policy Templates", url: "#" },
      { title: "Device Shadow Delta Handler (.cpp)", url: "#" },
      { title: "Serverless Alert Lambda Function (Python)", url: "#" }
    ],
    sequence_order: 4,
    status: "published"
  },
  {
    code: "IOT-501",
    title: "Full-Stack Reactive Telemetry Dashboards & Apps",
    slug: "fullstack-reactive-telemetry-dashboards",
    badge: "Full-Stack Web & Mobile",
    level: "Advanced",
    duration: "4 Lessons • 2h 24m",
    thumbnail_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&auto=format&fit=crop&q=80",
    description: "Build lightning-fast live telemetry dashboards with Next.js, WebSockets, interactive charting, and cross-platform mobile controls.",
    overview: "Bring physical hardware to life with a stunning, production-ready web and mobile user interface. Learn how to architect real-time Next.js dashboards streaming live sensor data over WebSockets at 60fps, render interactive canvas charts, and send sub-100ms bidirectional commands to control appliances.",
    hardware_used: [
      "ESP32 Bidirectional Edge Actuator",
      "Next.js App Router Web Portal",
      "Flutter Cross-Platform Mobile App",
      "Real-Time WebSockets Server"
    ],
    learning_outcomes: [
      "Architect responsive, low-latency telemetry dashboards with Next.js and Tailwind CSS",
      "Stream continuous 60fps sensor time-series data using Canvas and SVG without DOM lag",
      "Send low-latency commands from browser buttons to toggle physical relays worldwide",
      "Develop a companion native iOS and Android mobile app using Flutter"
    ],
    lessons: [
      {
        id: "l-501-1",
        sequence_order: 1,
        title: "Module 1: Building Real-Time IoT Dashboards with Next.js",
        duration: "28:50",
        description: "Architecture of industrial web telemetry portals, Next.js App Router, WebSockets streaming subscriptions, and dark mode UI design."
      },
      {
        id: "l-501-2",
        sequence_order: 2,
        title: "Module 2: High-Frequency Charting with Canvas & SVG",
        duration: "36:10",
        description: "Streaming time-series telemetry data at 60 frames per second without React render bottlenecks, circular ring buffers, and interactive sensor graphs."
      },
      {
        id: "l-501-3",
        sequence_order: 3,
        title: "Module 3: Bidirectional Cloud-to-Edge Appliance Remote Control",
        duration: "38:40",
        description: "Executing sub-100ms commands to toggle relays and control physical hardware benches securely from any web browser worldwide."
      },
      {
        id: "l-501-4",
        sequence_order: 4,
        title: "Module 4: Cross-Platform Mobile IoT Control with Flutter",
        duration: "40:30",
        description: "Developing native iOS and Android companion apps in Flutter, Bluetooth LE local discovery, AWS IoT Core integration, and instant push notifications."
      }
    ],
    resources: [
      { title: "Next.js 16 Telemetry Portal Starter Kit", url: "#" },
      { title: "60fps Canvas Gauge Component Library", url: "#" },
      { title: "Flutter IoT Companion App Codebase", url: "#" }
    ],
    sequence_order: 5,
    status: "published"
  },
  {
    code: "IOT-601",
    title: "Industrial Automation, Edge AI & PLC Interfacing",
    slug: "industrial-automation-edge-ai-plc",
    badge: "Smart Industry 4.0",
    level: "Advanced",
    duration: "4 Lessons • 2h 35m",
    thumbnail_url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=900&auto=format&fit=crop&q=80",
    description: "Deploy edge anomaly detection with TinyML, interface Modbus RS-485 industrial fieldbuses, and integrate with commercial SCADA systems.",
    overview: "Take your embedded skills into real manufacturing and industrial plants. This course covers Modbus RTU/TCP protocols over RS-485 differential signaling, deploying quantized machine learning models directly onto the ESP32 for vibration anomaly detection, and meeting industrial ESD/EMI compliance.",
    hardware_used: [
      "ESP32 with RS-485 Transceiver Module",
      "TinyML TensorFlow Lite for Microcontrollers",
      "Vibration & Current Sensing Shunt",
      "Industrial DIN-Rail Power Enclosure"
    ],
    learning_outcomes: [
      "Implement Modbus RTU master/slave communications over RS-485 differential lines",
      "Train and quantize neural networks to run locally in <32KB SRAM using TinyML",
      "Detect mechanical motor bearing wear and electrical anomalies before failure occurs",
      "Design circuits meeting industrial ESD, EMI, and brownout reset safety standards"
    ],
    lessons: [
      {
        id: "l-601-1",
        sequence_order: 1,
        title: "Module 1: RS-485 Differential Signaling & Modbus Protocol",
        duration: "34:10",
        description: "Half-duplex vs full-duplex differential signaling, termination resistors, Modbus function codes, and communicating with industrial PLCs."
      },
      {
        id: "l-601-2",
        sequence_order: 2,
        title: "Module 2: TinyML Machine Learning on Microcontrollers",
        duration: "38:40",
        description: "Deploying quantized 8-bit integer neural networks using TensorFlow Lite for Microcontrollers, INT8 inference kernels, and tensor arena sizing."
      },
      {
        id: "l-601-3",
        sequence_order: 3,
        title: "Module 3: Predictive Maintenance: Motor Vibration Anomaly Detection",
        duration: "41:15",
        description: "Fast Fourier Transform (FFT) acceleration spectral analysis, peak frequency tracking, and predicting mechanical bearing faults at the edge."
      },
      {
        id: "l-601-4",
        sequence_order: 4,
        title: "Module 4: Industrial Robustness: Watchdogs, Brownout & ESD",
        duration: "41:00",
        description: "Hardware watchdog timers (WDT), brownout voltage detection circuits, transient voltage suppression (TVS), and optical field isolation."
      }
    ],
    resources: [
      { title: "RS-485 Industrial Wiring & Termination Guide (PDF)", url: "#" },
      { title: "TensorFlow Lite Edge Anomaly Detection Model (.tflite)", url: "#" },
      { title: "Industrial Watchdog Timer Implementation (.cpp)", url: "#" }
    ],
    sequence_order: 6,
    status: "published"
  }
];

async function initCoursesDb() {
  const client = await pool.connect();
  try {
    console.log('--- Initializing iot_courses Database Schema ---');

    await client.query(`
      CREATE TABLE IF NOT EXISTS iot_courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        badge VARCHAR(100) DEFAULT 'Physical Computing',
        level VARCHAR(50) DEFAULT 'Beginner',
        duration VARCHAR(100) DEFAULT '4 Lessons • 1h 42m',
        thumbnail_url TEXT,
        description TEXT,
        overview TEXT,
        hardware_used JSONB DEFAULT '[]',
        learning_outcomes JSONB DEFAULT '[]',
        lessons JSONB DEFAULT '[]',
        resources JSONB DEFAULT '[]',
        sequence_order INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_courses_slug ON iot_courses(slug);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_courses_sequence ON iot_courses(sequence_order);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_courses_status ON iot_courses(status);`);

    // Add course_id to iot_lectures if not present
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'iot_lectures' AND column_name = 'course_id'
        ) THEN
          ALTER TABLE iot_lectures ADD COLUMN course_id UUID REFERENCES iot_courses(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Check count of existing courses
    const { rows: countRows } = await client.query('SELECT COUNT(*) as cnt FROM iot_courses');
    const count = parseInt(countRows[0].cnt, 10);
    console.log(`Current iot_courses count: ${count}`);

    if (count === 0) {
      console.log('Seeding initial 6 IoT Masterclasses into iot_courses...');
      for (const c of SEED_COURSES) {
        await client.query(
          `INSERT INTO iot_courses (
            code, title, slug, badge, level, duration, thumbnail_url,
            description, overview, hardware_used, learning_outcomes, lessons, resources, sequence_order, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (slug) DO NOTHING;`,
          [
            c.code,
            c.title,
            c.slug,
            c.badge,
            c.level,
            c.duration,
            c.thumbnail_url,
            c.description,
            c.overview,
            JSON.stringify(c.hardware_used),
            JSON.stringify(c.learning_outcomes),
            JSON.stringify(c.lessons),
            JSON.stringify(c.resources),
            c.sequence_order,
            c.status
          ]
        );
      }
      console.log('Successfully seeded 6 IoT Masterclasses into database!');
    } else {
      console.log('iot_courses table already populated.');
    }
  } catch (error) {
    console.error('Error in initCoursesDb:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  initCoursesDb()
    .then(() => {
      console.log('Database initialization completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
}

module.exports = { initCoursesDb };
