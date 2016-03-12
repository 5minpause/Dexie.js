﻿import Dexie from 'dexie';

const Promise = Dexie.Promise; // KEEP! (or loose transaction safety in await calls!)
const all = Promise.all;

export class AppDatabase extends Dexie {

    contacts: Dexie.Table<Contact, number>;
    emails: Dexie.Table<IEmailAddress, number>;
    phones: Dexie.Table<IPhoneNumber, number>;

    constructor() {

        super("ContactsDatabase");

        var db = this;

        //
        // Define tables and indexes
        //
        db.version(1).stores({
            contacts: '++id, firstName, lastName',
            emails: '++id, contactId, type, email',
            phones: '++id, contactId, type, phone',
        });

        // Let's physically map Contact class to contacts table.
        // This will make it possible to call loadEmailsAndPhones()
        // directly on retrieved database objects.
        db.contacts.mapToClass(Contact);
    }
}

/* Just for code completion and compilation - defines
    * the interface of objects stored in the emails table.
    */
export interface IEmailAddress {
    id?: number;
    contactId: number;
    type: string;
    email: string;
}

/* Just for code completion and compilation - defines
    * the interface of objects stored in the phones table.
    */
export interface IPhoneNumber {
    id?: number;
    contactId: number;
    type: string;
    phone: string;
}

/* This is a 'physical' class that is mapped to
    * the contacts table. We can have methods on it that
    * we could call on retrieved database objects.
    */
export class Contact {
    id: number;
    firstName: string;
    lastName: string;
    emails: IEmailAddress[];
    phones: IPhoneNumber[];
    
    constructor(first: string, last: string, id?:number) {
        this.firstName = first;
        this.lastName = last;
        if (id) this.id = id;
        // Define navigation properties.
        // Making them non-enumerable will prevent them from being handled by indexedDB
        // when doing put() or add().
        Object.defineProperties(this, {
            emails: {value: [], enumerable: false, writable: true },
            phones: {value: [], enumerable: false, writable: true }
        });
    }
    
    async loadNavigationProperties() {
        [this.emails, this.phones] = await all<any>(
            db.emails.where('contactId').equals(this.id).toArray(),
            db.phones.where('contactId').equals(this.id).toArray()
        );
    }

    save() {
        return db.transaction('rw', db.contacts, db.emails, db.phones, async () => {
          
            let [emailIds, phoneIds] = await all (
                // Save existing arrays
                all(this.emails.map(email => db.emails.put(email))),
                all(this.phones.map(phone => db.phones.put(phone))));
                            
            // Remove items from DB that is was not saved here:
            await db.emails.where('contactId').equals(this.id)
                .and(email => emailIds.indexOf(email.id) === -1)
                .delete();
            
            await db.phones.where('contactId').equals(this.id)
                .and(phone => phoneIds.indexOf(phone.id) === -1)
                .delete();

            // At last, save this Contact
            return await db.contacts.put(this);
        });
    }
}

export var db = new AppDatabase();

